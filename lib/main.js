import dayjs from 'dayjs';

export const formatLocalDateTime = (datetimeString, offsetHours = 3) => {
    if (!datetimeString) return 'Еще не было';
    return dayjs(datetimeString).add(offsetHours, 'hour').format('DD.MM.YYYY HH:mm');
};
