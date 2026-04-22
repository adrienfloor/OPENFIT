import { describe, it, expect } from 'vitest';
import { computeBMR, bmrCaloriesElapsed, ageYearsFromDob } from '../bmr';

describe('computeBMR (Mifflin-St Jeor)', () => {
  it('computes male BMR correctly', () => {
    // 80kg, 180cm, 40y, male → 10·80 + 6.25·180 − 5·40 + 5 = 1730
    expect(computeBMR({ weightKg: 80, heightCm: 180, ageYears: 40, sex: 'male' })).toBe(1730);
  });

  it('computes female BMR correctly', () => {
    // 65kg, 165cm, 35y, female → 10·65 + 6.25·165 − 5·35 − 161 = 1345.25
    expect(
      computeBMR({ weightKg: 65, heightCm: 165, ageYears: 35, sex: 'female' }),
    ).toBeCloseTo(1345.25, 2);
  });

  it('men have a higher BMR than women at the same anthropometrics', () => {
    const male = computeBMR({ weightKg: 70, heightCm: 175, ageYears: 30, sex: 'male' });
    const female = computeBMR({ weightKg: 70, heightCm: 175, ageYears: 30, sex: 'female' });
    expect(male - female).toBe(166);
  });
});

describe('bmrCaloriesElapsed', () => {
  it('returns 0 at the very start of the day', () => {
    const midnight = new Date('2026-04-22T00:00:00');
    expect(bmrCaloriesElapsed(1730, midnight)).toBeCloseTo(0, 5);
  });

  it('returns the full BMR at the end of the day', () => {
    const endOfDay = new Date('2026-04-22T23:59:59.999');
    expect(bmrCaloriesElapsed(1730, endOfDay)).toBeCloseTo(1730, 0);
  });

  it('prorates midday correctly', () => {
    // 16:19 local = 979 minutes of 1440 = 0.6799...
    const now = new Date('2026-04-22T16:19:00');
    const expected = 1730 * (979 / 1440);
    expect(bmrCaloriesElapsed(1730, now)).toBeCloseTo(expected, 2);
  });
});

describe('ageYearsFromDob', () => {
  it('floors to whole years', () => {
    const dob = new Date('1985-08-22');
    const ref = new Date('2026-04-22');
    // Not yet past August 22 → still 40
    expect(ageYearsFromDob(dob, ref)).toBe(40);
  });

  it('ticks over on birthday', () => {
    const dob = new Date('1985-08-22');
    const ref = new Date('2026-08-22');
    expect(ageYearsFromDob(dob, ref)).toBe(41);
  });
});
