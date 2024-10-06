function getUniqueDateTimeLabel() {
    const date = new Date();
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
    return `${day}${month}${year}${hours}${minutes}${seconds}${milliseconds}`;
}

function getTimeElapsed(startTime, endTime) {
    const uploadTime = endTime - startTime;
    const hours = Math.floor(uploadTime / (1000 * 60 * 60));
    const minutes = Math.floor((uploadTime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((uploadTime % (1000 * 60)) / 1000);
    const milliseconds = uploadTime % 1000;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
}

export {getUniqueDateTimeLabel, getTimeElapsed};