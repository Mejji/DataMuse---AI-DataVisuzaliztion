from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import upload, chat, analyze, story, data
from app.config import settings

app = FastAPI(title="DataMuse API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(chat.router)
app.include_router(analyze.router)
app.include_router(story.router)
app.include_router(data.router)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "datamuse"}
