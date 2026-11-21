from database import get_db_connection

try:
    connection = get_db_connection()

    if connection.is_connected():
        print("MySQL Connected Successfully!")

    connection.close()

except Exception as e:
    print("Database Connection Failed:", e)