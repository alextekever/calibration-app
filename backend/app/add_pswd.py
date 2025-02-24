from passlib.context import CryptContext

# Make sure this context is the same as in your FastAPI code.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Generate a hash for the password "admin"
hashed = pwd_context.hash("a>.NTh8`vr;PLk,sU#JA[u")
print(hashed)
