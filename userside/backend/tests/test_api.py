"""API tests on a throwaway SQLite database (dialer off).  .venv\\Scripts\\python.exe -m pytest -q"""
import io
import os
import tempfile

os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(tempfile.mkdtemp(), "test.db").replace("\\", "/")
os.environ["DIALER_ENABLED"] = "0"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from openpyxl import Workbook  # noqa: E402

from app import agent_context, config  # noqa: E402
from app.main import app  # noqa: E402
from app.phones import normalize  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def register(client, email, company="Acme Pvt Ltd"):
    r = client.post("/api/auth/register", json={
        "company_name": company, "name": "Owner", "email": email, "password": "secret123"})
    assert r.status_code == 201, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


def test_phone_normalize():
    assert normalize("98765 43210") == "+919876543210"
    assert normalize("+91-98765-43210") == "+919876543210"
    assert normalize("09876543210") == "+919876543210"
    assert normalize(9876543210.0) == "+919876543210"
    assert normalize("0044 20 7946 0958") == "+442079460958"
    assert normalize("919876543210") == "+919876543210"
    assert normalize("99887867687") is None  # 11 digits without "+": a typo
    assert normalize("12345") is None
    assert normalize("5876543210") is None  # not an Indian mobile


def test_register_login_and_isolation(client):
    a = register(client, "a@example.com", "Company A")
    b = register(client, "b@example.com", "Company B")
    assert client.post("/api/auth/register", json={
        "company_name": "Other Co", "name": "Someone", "email": "a@example.com",
        "password": "secret123"}).status_code == 409
    assert client.post("/api/auth/login", json={"email": "a@example.com", "password": "nope1234"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "A@Example.com", "password": "secret123"}).status_code == 200

    cid = client.post("/api/campaigns", json={"name": "EMI reminder"}, headers=a).json()["id"]
    # company B can neither see nor touch company A's campaign
    assert client.get("/api/campaigns", headers=b).json() == []
    assert client.get(f"/api/campaigns/{cid}", headers=b).status_code == 404
    assert client.post(f"/api/campaigns/{cid}/contacts", json={"phones": "9876543210"}, headers=b).status_code == 404
    assert client.get("/api/campaigns").status_code == 401


def test_contacts_manual_and_excel(client):
    h = register(client, "c@example.com")
    cid = client.post("/api/campaigns", json={"name": "Offer"}, headers=h).json()["id"]

    r = client.post(f"/api/campaigns/{cid}/contacts", headers=h,
                    json={"phones": "9876543210, Ravi\n+91 98765 43210\nabc\n\n7000000001"}).json()
    assert (r["added"], r["duplicates"], r["invalid"]) == (2, 1, 1)

    wb = Workbook()
    ws = wb.active
    ws.append(["Customer Name", "Mobile Number"])
    ws.append(["Asha", 9123456789])
    ws.append(["Dup", "9876543210"])
    ws.append(["Bad", "12"])
    buf = io.BytesIO()
    wb.save(buf)
    r = client.post(f"/api/campaigns/{cid}/upload", headers=h,
                    files={"file": ("list.xlsx", buf.getvalue(), "application/octet-stream")}).json()
    assert (r["added"], r["duplicates"], r["invalid"]) == (1, 1, 1)

    r = client.post(f"/api/campaigns/{cid}/upload", headers=h,
                    files={"file": ("list.csv", b"phone,name\n9988776655,Karan\n", "text/csv")}).json()
    assert r["added"] == 1

    contacts = client.get(f"/api/campaigns/{cid}/contacts", headers=h).json()
    assert {c["phone"]: c["name"] for c in contacts}["+919123456789"] == "Asha"
    assert client.get(f"/api/campaigns/{cid}", headers=h).json()["counts"] == {"pending": 4}

    client.patch("/api/company", headers=h, json={"call_window_start": 0, "call_window_end": 1})
    started = client.post(f"/api/campaigns/{cid}/start", headers=h).json()
    assert started["status"] == "running"
    from datetime import datetime
    from app.dialer import IST
    if datetime.now(IST).hour >= 1:
        assert "Outside your calling hours" in started["notice"]
    assert client.post(f"/api/campaigns/{cid}/pause", headers=h).json()["status"] == "paused"


def test_internal_flow_and_opt_out(client):
    h = register(client, "d@example.com", "Sharma Electronics")
    client.patch("/api/company", headers=h, json={"business_info": "Open 10 to 8."})
    cid = client.post("/api/campaigns", headers=h, json={
        "name": "Feedback", "opening_message": "Hi {name}, this is {company}. Got a minute?",
        "instructions": "Ask for feedback on the last purchase."}).json()["id"]
    client.post(f"/api/campaigns/{cid}/contacts", headers=h, json={"phones": "9876500001, Meena"})
    contact_id = client.get(f"/api/campaigns/{cid}/contacts", headers=h).json()[0]["id"]

    assert client.get(f"/api/internal/calls/{contact_id}/context").status_code == 403
    ih = {"X-Internal-Token": config.INTERNAL_TOKEN}
    ctx = client.get(f"/api/internal/calls/{contact_id}/context", headers=ih).json()
    assert ctx["greeting"] == "Hi Meena, this is Sharma Electronics. Got a minute?"
    assert "Open 10 to 8." in ctx["system_prompt"] and "feedback" in ctx["system_prompt"]

    r = client.post(f"/api/internal/calls/{contact_id}/result", headers=ih, json={
        "turns": [{"user": "Please don't call me again", "agent": "Sorry, we will not call again."}],
        "duration_seconds": 21})
    assert r.status_code == 204
    c = client.get(f"/api/campaigns/{cid}/contacts", headers=h).json()[0]
    assert c["status"] == "completed" and c["duration_seconds"] == 21
    assert [d["phone"] for d in client.get("/api/company/dnd", headers=h).json()] == ["+919876500001"]


def test_calls_activity_and_export(client):
    h = register(client, "e@example.com", "Export Co")
    other = register(client, "f@example.com", "Other Co")
    cid = client.post("/api/campaigns", headers=h, json={"name": "Survey"}).json()["id"]
    client.post(f"/api/campaigns/{cid}/contacts", headers=h, json={"phones": "9876500011, Asha\n9876500012"})
    ids = [c["id"] for c in client.get(f"/api/campaigns/{cid}/contacts", headers=h).json()]

    from datetime import datetime, timezone
    from app.db import SessionLocal
    from app.models import Contact
    with SessionLocal() as db:  # what the dialer would have done
        for i, status in zip(ids, ("dialing", "no_answer")):
            c = db.get(Contact, i)
            c.status, c.attempts, c.last_attempt_at = status, 1, datetime.now(timezone.utc)
        db.commit()
    client.post(f"/api/internal/calls/{ids[0]}/result", headers={"X-Internal-Token": config.INTERNAL_TOKEN},
                json={"turns": [{"user": "हाँ, बोलिए", "agent": "Thank you"}], "duration_seconds": 12})

    calls = client.get("/api/calls", headers=h).json()
    assert calls["total"] == 2
    assert client.get("/api/calls?status=not_reached", headers=h).json()["total"] == 1
    assert client.get("/api/calls?q=Asha", headers=h).json()["items"][0]["status"] == "completed"
    assert client.get("/api/calls", headers=other).json()["total"] == 0

    days = client.get("/api/company/activity?days=7", headers=h).json()
    assert len(days) == 7 and days[-1]["answered"] == 1 and days[-1]["not_reached"] == 1

    r = client.get(f"/api/campaigns/{cid}/export.csv", headers=h)
    assert r.status_code == 200 and "Survey_results.csv" in r.headers["content-disposition"]
    text = r.content.decode("utf-8-sig")
    assert "Customer: हाँ, बोलिए / Agent: Thank you" in text and "+919876500012" in text
    assert client.get(f"/api/campaigns/{cid}/export.csv", headers=other).status_code == 404


def test_greeting_default_without_name():
    class O:  # minimal stand-ins
        pass
    company, campaign, contact = O(), O(), O()
    company.name, campaign.opening_message, contact.name = "Acme", "", ""
    assert agent_context.greeting(company, campaign, contact) == \
        "Hello, this is the virtual assistant from Acme. Is this a good time to talk?"
    assert agent_context.wants_opt_out([{"user": "mujhe dobara call mat karna"}])
    assert not agent_context.wants_opt_out([{"user": "yes I am interested"}])
