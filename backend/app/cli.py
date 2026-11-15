import getpass
import sys
from app.database import SessionLocal
from app.models import User
from app.security import hash_password


def reset_password(email: str) -> None:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email.lower().strip()).first()
        if not user:
            print(f"Error: No user found with email '{email}'")
            sys.exit(1)

        new_pw = getpass.getpass("Enter new password (min 8 chars): ")
        if len(new_pw) < 8:
            print("Error: Password must be at least 8 characters.")
            sys.exit(1)

        user.password_hash = hash_password(new_pw)
        db.commit()
        print(f"Password updated successfully for {user.email}.")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "reset-password":
        reset_password(sys.argv[2])
    else:
        print("Usage: python -m app.cli reset-password <email>")
        sys.exit(1)