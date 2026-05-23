const test = require('node:test');
const assert = require('node:assert/strict');

const schoolService = require('../src/services/school.service');

const { __testables } = schoolService;

test('school purge preserves admin ids while deleting tenant operational records', async () => {
  const deletedPublicIds = [];
  const userDeleteFilters = [];
  const modelCalls = [];

  const createModel = (key, deletedCount) => ({
    deleteMany: async (filter) => {
      modelCalls.push([key, filter]);
      return { deletedCount };
    },
  });

  const result = await __testables.purgeSchoolOperationalData({
    schoolId: 'school-1',
    preservedAdminUserIds: ['admin-1', 'admin-2'],
    uploads: [{ publicId: 'file-1' }, { publicId: 'file-2' }],
    requester: { userId: 'admin-1', role: 'school_admin' },
  }, {
    uploadService: {
      deleteFile: async (publicId) => {
        deletedPublicIds.push(publicId);
      },
    },
    models: {
      AuditLog: createModel('auditLogs', 3),
      Notification: createModel('notifications', 4),
      Message: createModel('messages', 5),
      Conversation: createModel('conversations', 2),
      Attendance: createModel('attendance', 7),
      Behavior: createModel('behavior', 6),
      Grade: createModel('grades', 8),
      Student: createModel('students', 10),
      Parent: createModel('parents', 9),
      Teacher: createModel('teachers', 4),
      Subject: createModel('subjects', 3),
      Class: createModel('classes', 5),
      User: {
        deleteMany: async (filter) => {
          userDeleteFilters.push(filter);
          return { deletedCount: 11 };
        },
      },
    },
  });

  assert.deepEqual(deletedPublicIds, ['file-1', 'file-2']);
  assert.equal(result.counts.uploads, 2);
  assert.equal(result.counts.students, 10);
  assert.equal(result.counts.users, 11);
  assert.equal(result.totalDeleted, 79);
  assert.equal(userDeleteFilters.length, 1);
  assert.deepEqual(userDeleteFilters[0], {
    schoolId: 'school-1',
    _id: { $nin: ['admin-1', 'admin-2'] },
  });
  assert.equal(modelCalls.length, 12);
});

test('purge upload filter keeps avatar uploads for preserved admins only', () => {
  assert.deepEqual(__testables.buildPurgeUploadFilter('school-1', ['admin-1']), {
    schoolId: 'school-1',
    $or: [
      { context: { $ne: 'avatar' } },
      { uploadedBy: { $nin: ['admin-1'] } },
    ],
  });
});