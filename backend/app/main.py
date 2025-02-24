from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlmodel import SQLModel, Session, create_engine, select
from app.models import User, CalibrationProject, CalibrationLog
from typing import List, Optional
from datetime import datetime
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, status, Form, Response
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import os

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/login")

# Secret key and algorithm (change SECRET_KEY in production)
SECRET_KEY = "your-secret-key"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = {"username": username, "permission": payload.get("permission")}
    except JWTError:
        raise credentials_exception
    with Session(engine) as session:
        statement = select(User).where(User.username == username)
        user = session.exec(statement).first()
        if user is None:
            raise credentials_exception
    return user

def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.permission != 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    return current_user


DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///database.db")
engine = create_engine(DATABASE_URL, echo=True)

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

app = FastAPI()

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://calibration-app-three.vercel.app",
    "https://calibration-app-git-main-alextekevers-projects.vercel.app",
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# === Models ===
class CalibrationProjectCreate(BaseModel):
    name: str
    user_id: int

class CalibrationLogCreate(BaseModel):
    calibration_number: int
    measured_temperature: float
    voltage_t1: float
    voltage_t2: float
    voltage_t3: float
    voltage_t4: float
    time: Optional[str] = None  # Accepts an ISO formatted datetime string

class CalibrationLogResponse(BaseModel):
    calibrationNumber: int
    time: str
    measuredTemperature: float
    measuredVoltageT1: float
    measuredVoltageT2: float
    measuredVoltageT3: float
    measuredVoltageT4: float

class CalibrationProjectResponse(BaseModel):
    id: str
    name: str
    created_at: datetime
    user_id: int
    username: str
    

# === Routes ===
@app.on_event("startup")
def on_startup():
    create_db_and_tables()

@app.get("/admin-only")
def admin_only_route(current_user: User = Depends(get_current_admin)):
    return {"message": f"Welcome, admin {current_user.username}!"}


@app.post("/login")
def login(response: Response, form_data: OAuth2PasswordRequestForm = Depends()):
    with Session(engine) as session:
        statement = select(User).where(User.username == form_data.username)
        user = session.exec(statement).first()
        if not user or not verify_password(form_data.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        # Create the JWT token with the username and permission level.
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = create_access_token(
            data={"sub": user.username, "permission": user.permission},
            expires_delta=access_token_expires
        )
        # Option A: Return the token in the response (for Bearer auth)
        return {"access_token": access_token, "token_type": "bearer", "id": user.id, "username": user.username, "permission": user.permission}

        # Option B (for session cookies): Uncomment the following lines to set an HTTP-only cookie.
        # response.set_cookie(key="access_token", value=access_token, httponly=True)
        # return {"message": "Logged in successfully", "id": user.id, "username": user.username, "permission": user.permission}

@app.get("/calibrations/", response_model=List[CalibrationProjectResponse])
def get_calibrations(user_id: int):
    with Session(engine) as session:
        statement = select(CalibrationProject).where(CalibrationProject.user_id == user_id)
        projects = session.exec(statement).all()
        response_projects = []
        for proj in projects:
            # Query for the user associated with this project
            user_statement = select(User).where(User.id == proj.user_id)
            user = session.exec(user_statement).first()
            response_projects.append(
                CalibrationProjectResponse(
                    id=proj.id,
                    name=proj.name,
                    created_at=proj.created_at,
                    user_id=proj.user_id,
                    username=user.username if user else "Unknown"
                )
            )
        return response_projects

@app.post("/calibrations/", response_model=CalibrationProject)
def create_calibration_project(cal_proj: CalibrationProjectCreate):
    project = CalibrationProject(name=cal_proj.name, user_id=cal_proj.user_id)
    with Session(engine) as session:
        session.add(project)
        session.commit()
        session.refresh(project)
    return project

# Add a new field to include the numeric timestamp.
class CalibrationLogResponse(BaseModel):
    calibrationNumber: int
    time: str
    timestamp: int      # New: numeric timestamp in ms
    measuredTemperature: float
    measuredVoltageT1: float
    measuredVoltageT2: float
    measuredVoltageT3: float
    measuredVoltageT4: float

@app.get("/calibrations/{project_id}/log", response_model=List[CalibrationLogResponse])
def get_calibration_logs(project_id: str):
    with Session(engine) as session:
        statement = select(CalibrationLog).where(CalibrationLog.calibration_project_id == project_id)
        logs = session.exec(statement).all()
        
        response_logs = []
        for log in logs:
            response_logs.append(CalibrationLogResponse(
                calibrationNumber=log.calibration_number,
                time=log.timestamp.isoformat(),  # full ISO string
                timestamp=int(log.timestamp.timestamp() * 1000),  # Convert to ms
                measuredTemperature=log.measured_temperature,
                measuredVoltageT1=log.measured_voltage_t1,
                measuredVoltageT2=log.measured_voltage_t2,
                measuredVoltageT3=log.measured_voltage_t3,
                measuredVoltageT4=log.measured_voltage_t4
            ))
        return response_logs
    
@app.post("/calibrations/{project_id}/log", response_model=CalibrationLogResponse)
def add_calibration_log(project_id: str, log_data: CalibrationLogCreate):
    # If a time is provided, try to parse it; otherwise, use the current time.
    if log_data.time:
        try:
            # Expecting ISO format (e.g., "2025-02-21T15:30:00")
            timestamp = datetime.fromisoformat(log_data.time)
        except ValueError:
            raise HTTPException(status_code=422, detail="Time must be in ISO format.")
    else:
        timestamp = datetime.utcnow()

    log = CalibrationLog(
        calibration_project_id=project_id,
        calibration_number=log_data.calibration_number,
        timestamp=timestamp,
        measured_temperature=log_data.measured_temperature,
        measured_voltage_t1=log_data.voltage_t1,
        measured_voltage_t2=log_data.voltage_t2,
        measured_voltage_t3=log_data.voltage_t3,
        measured_voltage_t4=log_data.voltage_t4
    )
    with Session(engine) as session:
        session.add(log)
        session.commit()
        session.refresh(log)
        response = CalibrationLogResponse(
            calibrationNumber=log.calibration_number,
            time=log.timestamp.isoformat(),  # full ISO string for consistency
            timestamp=int(log.timestamp.timestamp() * 1000),  # numeric timestamp in ms
            measuredTemperature=log.measured_temperature,
            measuredVoltageT1=log.measured_voltage_t1,
            measuredVoltageT2=log.measured_voltage_t2,
            measuredVoltageT3=log.measured_voltage_t3,
            measuredVoltageT4=log.measured_voltage_t4
        )

    return response


@app.delete("/calibrations/{project_id}", response_model=CalibrationProject)
def delete_calibration_project(project_id: str):
    with Session(engine) as session:
        project = session.get(CalibrationProject, project_id)
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        session.delete(project)
        session.commit()
        return project
# uvicorn app.main:app --reload
