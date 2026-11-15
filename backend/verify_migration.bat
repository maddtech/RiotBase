mkdir -p ./data
DATA_DIR=./data alembic revision --autogenerate -m "initial_schema"
DATA_DIR=./data alembic upgrade head