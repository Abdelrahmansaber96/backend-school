const { formatDualDate } = require('./dualDate');

const attendance = ({ studentName, type, date }) => {
  const labels = { absence: 'غياب', late: 'تأخر', permission: 'إذن' };
  const label = labels[type] || 'حضور';
  return { title: `تسجيل ${label}`, body: `تم تسجيل ${label} للطالب/الطالبة ${studentName} بتاريخ ${formatDualDate(date)}.` };
};
const behavior = ({ positive, studentName, description }) => ({
  title: positive ? 'سلوك إيجابي مسجل' : 'ملاحظة سلوكية مسجلة',
  body: `تم تسجيل ${positive ? 'سلوك إيجابي' : 'سلوك سلبي'} للطالب/الطالبة ${studentName || ''}${description ? `: ${String(description).slice(0, 120)}` : '.'}`,
});
const message = ({ senderName, preview }) => ({ title: `رسالة جديدة${senderName ? ` من ${senderName}` : ''}`, body: preview || 'لديك رسالة جديدة.' });
const importComplete = ({ imported, failed, label = 'طالب' }) => ({ title: `اكتمل استيراد ${label === 'معلم' ? 'المعلمين' : 'الطلاب'}`, body: `تم استيراد ${imported} ${label}، وتعذر استيراد ${failed} صف.` });
const reportReady = ({ report }) => ({ title: `تم تجهيز تقرير ${report}`, body: `أصبح تقرير ${report} جاهزًا للتنزيل.` });
const accountCreated = ({ label, name }) => ({ title: `تم إنشاء حساب ${label}`, body: `تم إنشاء حساب ${label} ${name} بنجاح.` });

module.exports = { attendance, behavior, message, importComplete, reportReady, accountCreated };
