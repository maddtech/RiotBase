import smtplib
from email.message import EmailMessage
from sqlalchemy.orm import Session

from app.config import settings
from app.models import InstanceSettings


def get_smtp_config(db: Session) -> dict | None:
    inst = db.get(InstanceSettings, 1)
    host = (inst.smtp_host if inst else None) or settings.SMTP_HOST
    sender = (inst.smtp_from if inst else None) or settings.SMTP_FROM
    if not host or not sender:
        return None

    return {
        "host": host,
        "port": (inst.smtp_port if inst and inst.smtp_port else None) or settings.SMTP_PORT or 587,
        "user": (inst.smtp_user if inst else None) or settings.SMTP_USER,
        "pass": (inst.smtp_pass if inst else None) or settings.SMTP_PASS,
        "from": sender,
    }


def send_email_if_configured(db: Session, to_addresses: list[str], subject: str, body: str) -> bool:
    cfg = get_smtp_config(db)
    recipients = [addr.strip() for addr in to_addresses if addr and addr.strip()]
    if not cfg or not recipients:
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = cfg["from"]
    msg["To"] = ", ".join(recipients)
    msg.set_content(body)

    try:
        if cfg["port"] == 465:
            with smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=10) as server:
                if cfg["user"] and cfg["pass"]:
                    server.login(cfg["user"], cfg["pass"])
                server.send_message(msg)
        else:
            with smtplib.SMTP(cfg["host"], cfg["port"], timeout=10) as server:
                server.starttls()
                if cfg["user"] and cfg["pass"]:
                    server.login(cfg["user"], cfg["pass"])
                server.send_message(msg)
        return True
    except Exception:
        return False