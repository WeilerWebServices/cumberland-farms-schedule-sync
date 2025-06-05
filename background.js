let kronosCredentials = null;
let googleAccessToken = null;

// Load saved credentials
chrome.storage.local.get('kronosCredentials', (data) => {
  if (data.kronosCredentials) {
    kronosCredentials = data.kronosCredentials;
  }
});

// Handle Kronos login
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'submitMFA') {
    handleMFA(message.mfaCode);
  }
  else if (message.type === 'scheduleData') {
    processSchedule(message.schedule);
  }
});

function handleMFA(mfaCode) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: (code) => {
        document.getElementById('mfaCode').value = code;
        document.getElementById('verify-mfa-button').click();
      },
      args: [mfaCode]
    });
  });
}

async function processSchedule(schedule) {
  if (!schedule.length) {
    updateStatus('⚠️ No shifts found in schedule');
    return;
  }
  
  updateStatus(`📅 Processing ${schedule.length} shifts...`);
  
  try {
    // Authenticate with Google
    googleAccessToken = await getGoogleAuthToken();
    
    // Create calendar events
    for (const shift of schedule) {
      await createCalendarEvent(shift);
      updateStatus(`✅ Added: ${shift.date} ${shift.start}-${shift.end}`);
    }
    
    updateStatus('🎉 Schedule synced to Google Calendar!');
  } catch (error) {
    updateStatus(`❌ Error: ${error.message}`);
  }
}

function getGoogleAuthToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

async function createCalendarEvent(shift) {
  // Parse shift date/time
  const shiftDate = parseDate(shift.date);
  const startDateTime = combineDateTime(shiftDate, shift.start);
  const endDateTime = combineDateTime(shiftDate, shift.end);
  
  // Create event payload
  const event = {
    summary: 'Work Shift',
    location: 'Cumberland Farms',
    start: { dateTime: startDateTime.toISOString(), timeZone: 'America/New_York' },
    end: { dateTime: endDateTime.toISOString(), timeZone: 'America/New_York' },
    reminders: { useDefault: true }
  };
  
  // Send to Google Calendar API
  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${googleAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(event)
  });
  
  if (!response.ok) {
    throw new Error('Failed to create calendar event');
  }
}

// Helper functions
function parseDate(dateStr) {
  // Format: "Wed 06/05/24"
  const [, month, day, year] = dateStr.match(/\w{3} (\d{2})\/(\d{2})\/(\d{2})/);
  return new Date(`20${year}-${month}-${day}`);
}

function combineDateTime(date, timeStr) {
  const [hours, minutes] = timeStr.includes('AM') || timeStr.includes('PM')
    ? parse12HourTime(timeStr)
    : timeStr.split(':').map(Number);
  
  const dateTime = new Date(date);
  dateTime.setHours(hours, minutes);
  return dateTime;
}

function parse12HourTime(timeStr) {
  const [, time, period] = timeStr.match(/(\d+):(\d+) (AM|PM)/);
  let hours = parseInt(time);
  const minutes = parseInt(minutes);
  
  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  
  return [hours, minutes];
}

function updateStatus(text) {
  chrome.runtime.sendMessage({ type: 'syncStatus', text });
}