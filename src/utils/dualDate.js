const gregorian = new Intl.DateTimeFormat('ar-EG-u-ca-gregory', { day: 'numeric', month: 'long', year: 'numeric' });
const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' });

const formatDualDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${gregorian.format(date)} م — ${hijri.format(date)} هـ`;
};

module.exports = { formatDualDate };
