const dateString = (timestamp = null, separator = "/") => {
    const date = timestamp ? new Date(timestamp * 1000) : new Date();
    const day = date.getDate() < 10 ? `0${date.getDate()}` : date.getDate();
    let month = date.getMonth() + 1;
    month = month < 10 ? `0${month}` : month;
    return day + separator + month + separator + date.getFullYear();
};

const timeString = (timestamp = null, separator = ":") => {
    const date = timestamp ? new Date(timestamp * 1000) : new Date();
    const hours = date.getHours() < 10 ? `0${date.getHours()}` : date.getHours();
    const minutes = date.getMinutes() < 10 ? `0${date.getMinutes()}` : date.getMinutes();
    const seconds = date.getSeconds() < 10 ? `0${date.getSeconds()}` : date.getSeconds();
    return hours + separator + minutes + separator + seconds;
};

const dateTimeString = (timestamp = null, separator = ":") => {
    return `${dateString(timestamp)} ${timeString(timestamp)}`;
};

module.exports = {
    dateString: dateString,
    timeString: timeString,
    dateTimeString: dateTimeString
};
