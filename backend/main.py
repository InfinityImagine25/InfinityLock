from fastapi import FastAPI

app = FastAPI(title="Infinity Lock API")

@app.get("/")
async def root():
    return {"message": "Backend live on Coolify!", "version": "1.0"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
