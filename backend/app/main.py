from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import Base, engine
# Import models so SQLAlchemy registers them before create_all
from app.models.opportunity import Opportunity

# Import all your routers
from app.routes.ai import router as ai_router
from app.routes.opportunities import router as opportunities_router
from app.routes.matching import router as matching_router
from app.routes.calendar import router as calendar_router
from app.routes.profile import router as profile_router
from app.routes.scraper import router as scraper_router

# 1. Initialize FastAPI app once
app = FastAPI(title="Aventra API")

# 2. Configure CORS for your Vite frontend (localhost:5173)
origins = [
        "https://nexora-six-rho-36.vercel.app",

    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Create database tables in Neon that do not already exist
Base.metadata.create_all(bind=engine)


# 4. Root & Health Check Endpoints
@app.get("/")
def home():
    return {"message": "Aventra API is running"}


@app.get("/api/health")
def health_check():
    return {"message": "Aventra backend connected!"}


# 5. Register all modular API routers
app.include_router(ai_router)
app.include_router(opportunities_router)
app.include_router(matching_router)
app.include_router(calendar_router)
app.include_router(profile_router)
app.include_router(scraper_router)

from app.routes.pdf import router as pdf_router
app.include_router(pdf_router)