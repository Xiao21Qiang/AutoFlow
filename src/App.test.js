import { getDashboardRoute } from './utils/auth';

test('resolves role dashboard routes', () => {
  expect(getDashboardRoute({ userType: 'Admin' })).toBe('/admin');
  expect(getDashboardRoute({ userType: 'Staff' })).toBe('/staff');
  expect(getDashboardRoute({ userType: 'Customer' })).toBe('/client');
});
