import mysql.connector

def get_db_connection():

    connection = mysql.connector.connect(
        host="localhost",
        user="root",
        password="A#affan09",
        database="hospital_readmission_db",
        port=3306
    )

    return connection