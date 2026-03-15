import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  submitSurvey, getOrCreateDeviceId, markAsSubmitted, clearSubmittedFlag,
  checkSubmittedOnServer, getRooms, saveDraft, loadDraft, clearDraft,
} from '../api.js';
import './SurveyForm.css';

function filterRooms(rooms, query) {
  if (!query.trim()) return rooms;
  const q = query.trim().toLowerCase();
  return rooms.filter(
    (r) =>
      String(r.id).toLowerCase().includes(q) ||
      (r.name && String(r.name).toLowerCase().includes(q))
  );
}

const QUESTIONS = [
  {
    key: 'service_quality',
    label: 'Оцените качество дополнительных услуг (аниматоры, посещение SPA)',
    hint: '1 — очень плохо, 5 — очень хорошо',
    commentKey: 'service_comment',
  },
  {
    key: 'cost_rating',
    label: 'Оцените стоимость услуг',
    hint: '1 — очень дорого, 5 — доступно',
    commentKey: 'cost_comment',
  },
  {
    key: 'cleaning_quality',
    label: 'Оцените качество уборки',
    hint: '1 — очень грязно, 5 — очень чисто',
    commentKey: 'cleaning_comment',
  },
  {
    key: 'reception_quality',
    label: 'Оцените работу зоны Ресепшен',
    hint: '1 — очень плохо, 5 — очень хорошо',
    commentKey: 'reception_comment',
  },
  {
    key: 'food_quality',
    label: 'Как вы оцениваете питание на курорте',
    hint: '1 — очень плохо, 5 — очень хорошо',
    commentKey: 'food_comment',
    optional: true,
  },
  {
    key: 'service_zone_quality',
    label: 'Оцените сервис в зоне шведки, ресторане, баре',
    hint: '1 — очень плохо, 5 — очень хорошо',
    commentKey: 'service_zone_comment',
    optional: true,
  },
];

const REQUIRED_QUESTIONS = QUESTIONS.filter((q) => !q.optional);

function buildEmptyForm() {
  return {
    room_id: '',
    ...QUESTIONS.reduce((acc, q) => {
      acc[q.key] = null;
      acc[q.commentKey] = '';
      return acc;
    }, {}),
  };
}

export default function SurveyForm() {
  const deviceId = useMemo(() => getOrCreateDeviceId(), []);
  const [serverSaysSubmitted, setServerSaysSubmitted] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!deviceId) {
      setChecking(false);
      setServerSaysSubmitted(false);
      return;
    }
    checkSubmittedOnServer(deviceId)
      .then((submitted) => {
        setServerSaysSubmitted(submitted);
        if (submitted) {
          markAsSubmitted();
          clearDraft();
        } else {
          clearSubmittedFlag();
        }
      })
      .catch(() => {
        setServerSaysSubmitted(false);
        clearSubmittedFlag();
      })
      .finally(() => setChecking(false));
  }, [deviceId]);

  const [rooms, setRooms] = useState([]);
  const [roomSearchQuery, setRoomSearchQuery] = useState('');
  const [roomDropdownOpen, setRoomDropdownOpen] = useState(false);
  const [activeDropdownIndex, setActiveDropdownIndex] = useState(-1);
  const roomDropdownRef = useRef(null);
  const dropdownListRef = useRef(null);

  const [form, setForm] = useState(() => loadDraft() ?? buildEmptyForm());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // Автосохранение черновика при каждом изменении формы
  useEffect(() => {
    saveDraft(form);
  }, [form]);

  const filteredRooms = useMemo(
    () => filterRooms(rooms, roomSearchQuery),
    [rooms, roomSearchQuery]
  );
  const selectedRoomName = useMemo(
    () => rooms.find((r) => String(r.id) === String(form.room_id))?.name ?? '',
    [rooms, form.room_id]
  );

  useEffect(() => {
    getRooms()
      .then(setRooms)
      .catch(() => setRooms([]));
  }, []);

  useEffect(() => {
    function handleClickOutside(e) {
      if (roomDropdownRef.current && !roomDropdownRef.current.contains(e.target)) {
        setRoomDropdownOpen(false);
        setActiveDropdownIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Прокрутка активного пункта в видимую область
  useEffect(() => {
    if (!dropdownListRef.current || activeDropdownIndex < 0) return;
    const items = dropdownListRef.current.querySelectorAll('[role="option"]');
    if (items[activeDropdownIndex]) {
      items[activeDropdownIndex].scrollIntoView({ block: 'nearest' });
    }
  }, [activeDropdownIndex]);

  const handleRoomKeyDown = useCallback((e) => {
    if (!roomDropdownOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setRoomDropdownOpen(true);
        setActiveDropdownIndex(0);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveDropdownIndex((i) => Math.min(i + 1, filteredRooms.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveDropdownIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeDropdownIndex >= 0 && filteredRooms[activeDropdownIndex]) {
        const r = filteredRooms[activeDropdownIndex];
        setForm((prev) => ({ ...prev, room_id: String(r.id) }));
        setRoomSearchQuery('');
        setRoomDropdownOpen(false);
        setActiveDropdownIndex(-1);
      }
    } else if (e.key === 'Escape') {
      setRoomDropdownOpen(false);
      setActiveDropdownIndex(-1);
      e.target.blur();
    }
  }, [roomDropdownOpen, filteredRooms, activeDropdownIndex]);

  const setRating = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  };

  const clearRating = (key, commentKey) => {
    setForm((prev) => ({ ...prev, [key]: null, [commentKey]: '' }));
  };

  const setComment = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const allFilled = REQUIRED_QUESTIONS.every((q) => form[q.key] !== null && form[q.key] >= 1 && form[q.key] <= 5);
  const filledCount = REQUIRED_QUESTIONS.filter((q) => form[q.key] !== null && form[q.key] >= 1 && form[q.key] <= 5).length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!allFilled || !deviceId) return;
    setLoading(true);
    setMessage(null);
    try {
      await submitSurvey({ ...form, device_id: deviceId });
      markAsSubmitted();
      clearDraft();
      setServerSaysSubmitted(true);
    } catch (err) {
      if (err.message && err.message.includes('уже отправили')) {
        markAsSubmitted();
        clearDraft();
        setServerSaysSubmitted(true);
        return;
      }
      setMessage({ type: 'error', text: err.message || 'Ошибка отправки' });
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <section className="survey-block">
        <h2 className="survey-title">Анонимное Анкетирование</h2>
        <p className="survey-subtitle">Загрузка...</p>
      </section>
    );
  }

  if (serverSaysSubmitted) {
    return (
      <section className="survey-block">
        <h2 className="survey-title">Анонимное Анкетирование</h2>
        <p className="survey-message survey-message--success survey-already-done">
          Вы уже отправили анкету. Спасибо!
        </p>
      </section>
    );
  }

  return (
    <section className="survey-block">
      <h2 className="survey-title">Анонимное Анкетирование</h2>
      <p className="survey-subtitle">Пожалуйста, оцените по шкале от 1 до 5</p>

      <form onSubmit={handleSubmit} className="survey-form">
        <fieldset className="survey-fieldset survey-fieldset--room">
          <legend className="survey-legend">
            Номер комнаты <span className="survey-optional">(необязательно)</span>
          </legend>
          <div className="survey-room-combobox" ref={roomDropdownRef}>
            <input
              type="text"
              className="survey-room-input"
              placeholder="Введите номер или название"
              role="combobox"
              aria-expanded={roomDropdownOpen}
              aria-autocomplete="list"
              aria-controls="room-dropdown"
              aria-activedescendant={
                activeDropdownIndex >= 0 && filteredRooms[activeDropdownIndex]
                  ? `room-option-${filteredRooms[activeDropdownIndex].id}`
                  : undefined
              }
              value={roomDropdownOpen ? roomSearchQuery : selectedRoomName || roomSearchQuery}
              onChange={(e) => {
                setRoomSearchQuery(e.target.value);
                setRoomDropdownOpen(true);
                setActiveDropdownIndex(-1);
                if (form.room_id) setForm((prev) => ({ ...prev, room_id: '' }));
              }}
              onFocus={() => {
                setRoomDropdownOpen(true);
                if (form.room_id && !roomSearchQuery) setRoomSearchQuery(selectedRoomName);
              }}
              onKeyDown={handleRoomKeyDown}
              autoComplete="off"
            />
            {roomDropdownOpen && (
              <ul
                id="room-dropdown"
                ref={dropdownListRef}
                className="survey-room-dropdown"
                role="listbox"
              >
                {filteredRooms.length === 0 ? (
                  <li className="survey-room-dropdown-item survey-room-dropdown-item--empty">
                    Нет подходящих комнат
                  </li>
                ) : (
                  filteredRooms.map((r, idx) => (
                    <li
                      key={r.id}
                      id={`room-option-${r.id}`}
                      role="option"
                      aria-selected={String(r.id) === String(form.room_id)}
                      className={`survey-room-dropdown-item${idx === activeDropdownIndex ? ' survey-room-dropdown-item--active' : ''}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setForm((prev) => ({ ...prev, room_id: String(r.id) }));
                        setRoomSearchQuery('');
                        setRoomDropdownOpen(false);
                        setActiveDropdownIndex(-1);
                      }}
                    >
                      {r.name}
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </fieldset>
        {QUESTIONS.map((q) => (
          <fieldset key={q.key} className="survey-fieldset">
            <legend className="survey-legend">
              {q.label}
              {q.optional && <span className="survey-optional"> (необязательно)</span>}
            </legend>
            {q.hint && <span className="survey-hint">{q.hint}</span>}
            <div className="survey-radios">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`survey-radio-btn${form[q.key] === n ? ' survey-radio-btn--active' : ''}`}
                  onClick={() => setRating(q.key, n)}
                  aria-label={`Оценка ${n}`}
                  aria-pressed={form[q.key] === n}
                >
                  {n}
                </button>
              ))}
              {q.optional && form[q.key] !== null && (
                <button
                  type="button"
                  className="survey-skip-btn"
                  onClick={() => clearRating(q.key, q.commentKey)}
                >
                  Не пользовался(ась)
                </button>
              )}
            </div>
            {q.optional && form[q.key] === null && (
              <p className="survey-skip-hint">Не оценивайте, если не пользовались этой услугой</p>
            )}
            <div className="survey-comment-wrap">
              <textarea
                className="survey-comment"
                rows={3}
                maxLength={2000}
                placeholder="Здесь вы можете описать, что именно не понравилось или понравилось (до 2000 символов)"
                value={form[q.commentKey]}
                onChange={(e) => setComment(q.commentKey, e.target.value)}
              />
              {form[q.commentKey].length > 0 && (
                <span className="survey-char-count">{form[q.commentKey].length}/2000</span>
              )}
            </div>
          </fieldset>
        ))}

        {message && (
          <p className={`survey-message survey-message--${message.type}`}>
            {message.text}
          </p>
        )}

        <div className="survey-footer">
          <span className="survey-progress">{filledCount} / {REQUIRED_QUESTIONS.length} оценено</span>
          <button
            type="submit"
            disabled={!allFilled || loading}
            className="survey-submit"
          >
            {loading ? 'Отправка...' : 'Отправить'}
          </button>
        </div>
      </form>
    </section>
  );
}
