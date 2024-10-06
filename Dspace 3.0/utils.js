function getUniqueDateTimeLabel() {
    const date = new Date();
    
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
    
    const timezoneOffset = date.getTimezoneOffset();
    const offsetHours = String(Math.floor(Math.abs(timezoneOffset) / 60)).padStart(2, '0');
    const offsetMinutes = String(Math.abs(timezoneOffset) % 60).padStart(2, '0');
    const timezoneSign = timezoneOffset > 0 ? '-' : '+';
    
    const timezone = `${timezoneSign}${offsetHours}:${offsetMinutes}`;
    
    return `${day}:${month}:${year}:${hours}:${minutes}:${seconds}:${milliseconds}:${timezone}`;
}

function getTimeElapsed(startTime, endTime) {
    if (!(startTime instanceof Date)) startTime = new Date(startTime);
    if (!(endTime instanceof Date)) endTime = new Date(endTime);

    const diffMs = endTime - startTime;

    const diffDate = new Date(diffMs);

    const years = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365.25));
    const remainingMsAfterYears = diffMs % (1000 * 60 * 60 * 24 * 365.25);

    const months = Math.floor(remainingMsAfterYears / (1000 * 60 * 60 * 24 * 30));
    const remainingMsAfterMonths = remainingMsAfterYears % (1000 * 60 * 60 * 24 * 30);

    const days = Math.floor(remainingMsAfterMonths / (1000 * 60 * 60 * 24));
    const remainingMsAfterDays = remainingMsAfterMonths % (1000 * 60 * 60 * 24);

    const hours = Math.floor(remainingMsAfterDays / (1000 * 60 * 60));
    const remainingMsAfterHours = remainingMsAfterDays % (1000 * 60 * 60);

    const minutes = Math.floor(remainingMsAfterHours / (1000 * 60));
    const remainingMsAfterMinutes = remainingMsAfterHours % (1000 * 60);

    const seconds = Math.floor(remainingMsAfterMinutes / 1000);
    const milliseconds = remainingMsAfterMinutes % 1000;

    return `${years.toString().padStart(2, '0')}:${months.toString().padStart(2, '0')}:${days.toString().padStart(2, '0')}:${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${milliseconds.toString().padStart(3, '0')}`;
}

export {getUniqueDateTimeLabel, getTimeElapsed};