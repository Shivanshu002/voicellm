"""What the voice agent says and knows on one outbound call."""
import re

from .models import Campaign, Company, Contact

# a callee saying any of these is added to the company's do-not-call list
_OPT_OUT = re.compile(
    r"\b(do not|don't|dont|never|stop)\s+(call|calling|contact|ring)|"
    r"\bremove (my|this) number\b|\bnot interested\b|\bunsubscribe\b|"
    r"call mat|phone mat|dobara (call|phone) mat",
    re.IGNORECASE,
)


def greeting(company: Company, campaign: Campaign, contact: Contact) -> str:
    template = campaign.opening_message.strip() or (
        "Hello{name_part}, this is the virtual assistant from {company}. Is this a good time to talk?"
    )
    name_part = f" {contact.name}" if contact.name else ""
    text = template.replace("{name_part}", name_part).replace("{company}", company.name)
    text = text.replace("{name}", contact.name or "")
    return re.sub(r"\s+([,.?!])", r"\1", re.sub(r"\s{2,}", " ", text)).strip()


def system_prompt(company: Company, campaign: Campaign, contact: Contact) -> str:
    parts = [
        f"You are a polite voice assistant from {company.name} on an outbound phone call"
        + (f" with {contact.name}." if contact.name else "."),
        "Reply in one or two short spoken sentences, under 30 words, and keep the first sentence very short.",
        "No lists, no markdown, no emojis. Never invent prices, dates or policies.",
        "If the person is busy, offer to call later and say goodbye.",
        "If the person asks not to be called again, apologise, confirm they will not be called again, and say goodbye.",
    ]
    if campaign.instructions.strip():
        parts.append("Purpose of this call: " + campaign.instructions.strip())
    if company.business_info.strip():
        parts.append("Business facts you may use:\n" + company.business_info.strip())
    return "\n".join(parts)


def wants_opt_out(turns: list[dict]) -> bool:
    return any(_OPT_OUT.search(t.get("user", "")) for t in turns)
