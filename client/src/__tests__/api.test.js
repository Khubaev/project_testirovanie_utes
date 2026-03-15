import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getOrCreateDeviceId,
  hasAlreadySubmitted,
  markAsSubmitted,
  clearSubmittedFlag,
  saveDraft,
  loadDraft,
  clearDraft,
} from '../api.js';

// localStorage mock через jsdom — уже доступен в jsdom окружении
beforeEach(() => {
  localStorage.clear();
});

describe('getOrCreateDeviceId', () => {
  it('создаёт новый UUID и сохраняет в localStorage', () => {
    const id = getOrCreateDeviceId();
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(localStorage.getItem('guest_survey_device_id')).toBe(id);
  });

  it('возвращает существующий ID при повторном вызове', () => {
    const id1 = getOrCreateDeviceId();
    const id2 = getOrCreateDeviceId();
    expect(id1).toBe(id2);
  });
});

describe('markAsSubmitted / hasAlreadySubmitted / clearSubmittedFlag', () => {
  it('hasAlreadySubmitted возвращает false по умолчанию', () => {
    expect(hasAlreadySubmitted()).toBe(false);
  });

  it('markAsSubmitted устанавливает флаг', () => {
    markAsSubmitted();
    expect(hasAlreadySubmitted()).toBe(true);
  });

  it('clearSubmittedFlag сбрасывает флаг', () => {
    markAsSubmitted();
    clearSubmittedFlag();
    expect(hasAlreadySubmitted()).toBe(false);
  });
});

describe('saveDraft / loadDraft / clearDraft', () => {
  const draft = {
    room_id: '5',
    service_quality: 4,
    service_comment: 'Хорошо',
    cost_rating: 3,
    cost_comment: '',
    cleaning_quality: 5,
    cleaning_comment: '',
    reception_quality: 2,
    reception_comment: '',
    food_quality: null,
    food_comment: '',
    service_zone_quality: null,
    service_zone_comment: '',
  };

  it('loadDraft возвращает null если черновика нет', () => {
    expect(loadDraft()).toBeNull();
  });

  it('saveDraft сохраняет данные формы', () => {
    saveDraft(draft);
    expect(localStorage.getItem('guest_survey_draft')).toBeTruthy();
  });

  it('loadDraft возвращает сохранённые данные', () => {
    saveDraft(draft);
    const loaded = loadDraft();
    expect(loaded).toEqual(draft);
  });

  it('clearDraft удаляет черновик', () => {
    saveDraft(draft);
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it('loadDraft возвращает null при повреждённых данных в localStorage', () => {
    localStorage.setItem('guest_survey_draft', 'not-valid-json{{{');
    expect(loadDraft()).toBeNull();
  });
});
