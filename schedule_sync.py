import os
import time
import datetime
from dotenv import load_dotenv
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# Load environment variables
load_dotenv()

# Configuration
KRONOS_URL = "https://cumberlandfarms-sso.prd.mykronos.com/wfd/ess/myschedule"
USERNAME = os.getenv('KRONOS_USERNAME')
PASSWORD = os.getenv('KRONOS_PASSWORD')
TIMEZONE = os.getenv('TIMEZONE', 'America/New_York')
SCOPES = ['https://www.googleapis.com/auth/calendar']
CALENDAR_ID = 'primary'

def get_mms_code():
    return input("✉️ Enter MFA code from SMS: ").strip()

def setup_selenium():
    options = webdriver.ChromeOptions()
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    driver = webdriver.Chrome(ChromeDriverManager().install(), options=options)
    driver.maximize_window()
    return driver

def login_to_kronos(driver):
    print("🌐 Logging into Kronos...")
    driver.get(KRONOS_URL)
    
    WebDriverWait(driver, 20).until(
        EC.visibility_of_element_located((By.ID, "username"))
    ).send_keys(USERNAME)
    
    driver.find_element(By.ID, "password").send_keys(PASSWORD)
    driver.find_element(By.ID, "login-button").click()
    
    WebDriverWait(driver, 20).until(
        EC.visibility_of_element_located((By.ID, "mfaCode"))
    ).send_keys(get_mms_code())
    
    driver.find_element(By.ID, "verify-mfa-button").click()

def extract_schedule(driver):
    print("🔍 Extracting schedule...")
    WebDriverWait(driver, 30).until(
        EC.presence_of_element_located((By.CLASS_NAME, "schedule-table"))
    )
    
    schedule = []
    rows = driver.find_elements(By.CSS_SELECTOR, ".schedule-table tbody tr")
    
    for row in rows:
        try:
            date_element = row.find_element(By.CSS_SELECTOR, "td.date-column")
            shift_element = row.find_element(By.CSS_SELECTOR, "td.shift-column")
            
            date_str = date_element.text.strip()
            shift_str = shift_element.text.strip()
            
            if "Off" in shift_str or not shift_str:
                continue
                
            shift_parts = shift_str.split(' - ')
            if len(shift_parts) != 2:
                continue
                
            start_time = shift_parts[0]
            end_time = shift_parts[1]
            
            schedule.append({
                "date": date_str,
                "start": start_time,
                "end": end_time
            })
        except:
            continue
    
    return schedule

def get_google_calendar_service():
    creds = None
    token_file = 'token.json'
    
    if os.path.exists(token_file):
        creds = Credentials.from_authorized_user_file(token_file, SCOPES)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists('credentials.json'):
                print("❌ Error: credentials.json not found!")
                print("ℹ️ Follow these steps to create it:")
                print("1. Go to https://console.cloud.google.com/apis/credentials")
                print("2. Create OAuth 2.0 Client ID (Desktop app type)")
                print("3. Download credentials.json and place in project directory")
                exit(1)
                
            flow = InstalledAppFlow.from_client_secrets_file(
                'credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        
        with open(token_file, 'w') as token:
            token.write(creds.to_json())
    
    return build('calendar', 'v3', credentials=creds)

def create_calendar_events(service, schedule):
    print("📅 Creating calendar events...")
    timezone = TIMEZONE
    
    for shift in schedule:
        try:
            shift_date = datetime.datetime.strptime(shift["date"], '%a %m/%d/%y')
            start_datetime = datetime.datetime.strptime(
                f"{shift_date.strftime('%Y-%m-%d')} {shift['start']}",
                '%Y-%m-%d %I:%M %p'
            )
            end_datetime = datetime.datetime.strptime(
                f"{shift_date.strftime('%Y-%m-%d')} {shift['end']}",
                '%Y-%m-%d %I:%M %p'
            )
            
            event = {
                'summary': 'Work Shift',
                'location': 'Cumberland Farms',
                'start': {
                    'dateTime': start_datetime.isoformat(),
                    'timeZone': timezone,
                },
                'end': {
                    'dateTime': end_datetime.isoformat(),
                    'timeZone': timezone,
                },
                'reminders': {
                    'useDefault': True,
                },
            }
            
            service.events().insert(
                calendarId=CALENDAR_ID,
                body=event
            ).execute()
            print(f"✅ Added: {shift['date']} {shift['start']}-{shift['end']}")
        except Exception as e:
            print(f"❌ Error creating event: {e}")

def main():
    print("🚀 Starting schedule synchronization...")
    driver = setup_selenium()
    try:
        login_to_kronos(driver)
        schedule = extract_schedule(driver)
        service = get_google_calendar_service()
        create_calendar_events(service, schedule)
        print("🎉 Success! Schedule transferred to Google Calendar")
    except Exception as e:
        print(f"🔥 Error: {str(e)}")
    finally:
        driver.quit()
        print("✅ Script completed")

if __name__ == "__main__":
    main()
