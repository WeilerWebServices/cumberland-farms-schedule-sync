import os
import time
import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# Configuration
KRONOS_URL = "https://cumberlandfarms-sso.prd.mykronos.com/wfd/ess/myschedule"
USERNAME = os.getenv('KRONOS_USERNAME')  # Set in environment variables
PASSWORD = os.getenv('KRONOS_PASSWORD')  # Set in environment variables
SCOPES = ['https://www.googleapis.com/auth/calendar']
CALENDAR_ID = 'primary'  # Use 'primary' for main calendar

def get_mms_code():
    """Retrieve MMS code from user input (manual step)"""
    return input("Enter MFA code from SMS: ").strip()

def setup_selenium():
    """Configure Selenium WebDriver"""
    options = webdriver.ChromeOptions()
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    driver = webdriver.Chrome(options=options)
    driver.maximize_window()
    return driver

def login_to_kronos(driver):
    """Login to Kronos portal and handle MFA"""
    driver.get(KRONOS_URL)
    
    # Enter credentials
    WebDriverWait(driver, 20).until(
        EC.visibility_of_element_located((By.ID, "username"))
    ).send_keys(USERNAME)
    
    driver.find_element(By.ID, "password").send_keys(PASSWORD)
    driver.find_element(By.ID, "login-button").click()
    
    # Handle MFA
    WebDriverWait(driver, 20).until(
        EC.visibility_of_element_located((By.ID, "mfaCode"))
    ).send_keys(get_mms_code())
    
    driver.find_element(By.ID, "verify-mfa-button").click()

def extract_schedule(driver):
    """Extract schedule data from Kronos"""
    WebDriverWait(driver, 30).until(
        EC.presence_of_element_located((By.CLASS_NAME, "schedule-table"))
    )
    
    schedule = []
    rows = driver.find_elements(By.CSS_SELECTOR, ".schedule-table tbody tr")
    
    for row in rows:
        date_element = row.find_element(By.CSS_SELECTOR, "td.date-column")
        shift_element = row.find_element(By.CSS_SELECTOR, "td.shift-column")
        
        date_str = date_element.text.strip()
        shift_str = shift_element.text.strip()
        
        if "Off" in shift_str or not shift_str:
            continue
            
        try:
            shift_parts = shift_str.split(' - ')
            start_time = shift_parts[0]
            end_time = shift_parts[1]
            
            schedule.append({
                "date": date_str,
                "start": start_time,
                "end": end_time
            })
        except Exception as e:
            print(f"Error parsing shift: {shift_str} - {e}")
    
    return schedule

def get_google_calendar_service():
    """Authenticate and create Google Calendar service"""
    creds = None
    token_file = 'token.json'
    
    if os.path.exists(token_file):
        creds = Credentials.from_authorized_user_file(token_file, SCOPES)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                'credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        
        with open(token_file, 'w') as token:
            token.write(creds.to_json())
    
    return build('calendar', 'v3', credentials=creds)

def create_calendar_events(service, schedule):
    """Create events in Google Calendar"""
    timezone = 'America/New_York'  # Update to your timezone
    
    for shift in schedule:
        # Parse date and times
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
        print(f"Added shift: {shift['date']} {shift['start']} - {shift['end']}")

def main():
    # Set up and run automation
    driver = setup_selenium()
    try:
        login_to_kronos(driver)
        schedule = extract_schedule(driver)
        service = get_google_calendar_service()
        create_calendar_events(service, schedule)
        print("Schedule successfully transferred to Google Calendar!")
    except Exception as e:
        print(f"Error occurred: {str(e)}")
    finally:
        driver.quit()
        input("Press Enter to exit...")

if __name__ == "__main__":
    main()