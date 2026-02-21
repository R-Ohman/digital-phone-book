from contextlib import asynccontextmanager
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.database import run_migrations
from src.contacts.router import router as contacts_router
from src.llm.router import router as llm_router
from src.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    await asyncio.to_thread(run_migrations)
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

origins = ["http://localhost:4200"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(contacts_router)
app.include_router(llm_router)
