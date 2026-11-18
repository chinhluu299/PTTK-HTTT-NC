from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://medcare@127.0.0.1:5544/medcare"
    jwt_secret: str = "dev-secret-change-me"
    jwt_expire_hours: int = 12
    timezone: str = "Asia/Ho_Chi_Minh"
    frontend_url: str = "http://localhost:3000"
    cors_origins: str = "http://localhost:3000"

    # F1 – LLM qua thư viện `openai`, trỏ được tới mọi máy chủ tương thích OpenAI (vLLM, Ollama, LM Studio, gateway...).
    # llm_provider: "openai" | "offline" | "auto" (auto = có OPENAI_API_KEY thì gọi LLM, không có thì chạy offline)
    llm_provider: str = "auto"
    openai_api_key: str = ""
    openai_base_url: str = ""          # để trống = api.openai.com
    openai_model: str = "qwen3.5-9b"
    llm_timeout: int = 60              # giây; model suy luận (Qwen3.x) có thể trả lời chậm

    # F2 – thanh toán (SePay webhook). payment_dev_mode bật nút "giả lập chuyển khoản".
    sepay_api_key: str = "dev-sepay-key"
    payment_dev_mode: bool = True

    # Cloudinary: để trống thì lưu file vào thư mục uploads/
    cloudinary_url: str = ""

    # SMTP: để trống thì email được ghi ra thư mục outbox/
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "MedCare <no-reply@medcare.local>"

    hold_minutes: int = 5          # QĐ04
    slot_capacity: int = 3         # QĐ02
    no_show_after_minutes: int = 15  # QĐ05
    refund_min_hours: int = 12     # QĐ05
    booking_days_ahead: int = 14


settings = Settings()
