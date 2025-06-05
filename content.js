function extractSchedule() {
  const schedule = [];
  
  // Wait for schedule table to load
  const checkTable = setInterval(() => {
    const table = document.querySelector('.schedule-table');
    if (table) {
      clearInterval(checkTable);
      
      // Process schedule rows
      const rows = table.querySelectorAll('tbody tr');
      rows.forEach(row => {
        try {
          const dateCell = row.querySelector('td.date-column');
          const shiftCell = row.querySelector('td.shift-column');
          
          if (!dateCell || !shiftCell) return;
          
          const dateStr = dateCell.textContent.trim();
          const shiftStr = shiftCell.textContent.trim();
          
          if (!shiftStr || shiftStr.includes('Off')) return;
          
          const [startTime, endTime] = shiftStr.split(' - ');
          
          schedule.push({
            date: dateStr,
            start: startTime,
            end: endTime
          });
        } catch (e) {
          console.error('Error parsing row:', e);
        }
      });
      
      // Send schedule to background script
      chrome.runtime.sendMessage({ 
        type: 'scheduleData', 
        schedule 
      });
    }
  }, 1000);
}

// Start extraction when injected
extractSchedule();