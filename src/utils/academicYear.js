const getHijriYear = (date = new Date()) => {
  const formatter = new Intl.DateTimeFormat('en-u-ca-islamic', { year: 'numeric' });
  const yearPart = formatter.formatToParts(date).find((part) => part.type === 'year')?.value || '';
  const year = Number.parseInt(yearPart.replace(/\D/g, ''), 10);

  if (Number.isNaN(year)) {
    throw new Error('Unable to resolve Hijri year');
  }

  return year;
};

const getCurrentHijriAcademicYear = (date = new Date()) => {
  const startYear = getHijriYear(date);
  return `${startYear}-${startYear + 1}`;
};

module.exports = { getCurrentHijriAcademicYear };