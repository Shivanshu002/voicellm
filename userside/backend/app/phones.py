"""Phone number cleanup. Numbers are stored as E.164 (+<country><number>)."""
import re

DEFAULT_COUNTRY_CODE = "91"


def normalize(raw) -> str | None:
    """'98765 43210', '+91-9876543210', '09876543210', 9876543210.0 -> '+919876543210'.
    Returns None when it is not a plausible number."""
    if raw is None:
        return None
    if isinstance(raw, float) and raw.is_integer():  # Excel stores numbers as floats
        raw = int(raw)
    text = str(raw).strip()
    plus = text.startswith("+") or text.startswith("00")
    digits = re.sub(r"\D", "", text)
    if text.startswith("00"):
        digits = digits[2:]
    if not plus:
        # without "+" only Indian numbers: 10 digits, or 91 + 10 digits
        digits = digits.lstrip("0")
        if len(digits) == 10:
            digits = DEFAULT_COUNTRY_CODE + digits
        elif not (len(digits) == 12 and digits.startswith(DEFAULT_COUNTRY_CODE)):
            return None  # e.g. 11 digits: a typo, not a foreign number
    if not 8 <= len(digits) <= 15:
        return None
    if digits.startswith(DEFAULT_COUNTRY_CODE) and len(digits) == 12 and digits[2] not in "6789":
        return None  # Indian mobiles start with 6-9
    return "+" + digits
