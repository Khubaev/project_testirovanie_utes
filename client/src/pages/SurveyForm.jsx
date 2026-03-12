import { useState, useMemo, useEffect, useRef } from 'react';
import { submitSurvey, getOrCreateDeviceId, markAsSubmitted, clearSubmittedFlag, checkSubmittedOnServer, getRooms } from '../api.js';
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
  },
  {
    key: 'service_zone_quality',
    label: 'Оцените сервис в зоне шведки, ресторане, баре',
    hint: '1 — очень плохо, 5 — очень хорошо',
    commentKey: 'service_zone_comment',
  },
];

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
        if (submitted) markAsSubmitted();
        else clearSubmittedFlag();
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
  const roomDropdownRef = useRef(null);

  const [form, setForm] = useState({
    room_id: '',
    ...QUESTIONS.reduce((acc, q) => {
      acc[q.key] = null;
      acc[q.commentKey] = '';
      return acc;
    }, {}),
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

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
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const setRating = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setMessage(null);
  };

  const setComment = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const allFilled = QUESTIONS.every((q) => form[q.key] !== null && form[q.key] >= 1 && form[q.key] <= 5);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!allFilled || !deviceId) return;
    setLoading(true);
    setMessage(null);
    try {
      await submitSurvey({ ...form, device_id: deviceId });
      markAsSubmitted();
      setMessage({ type: 'success', text: 'Спасибо! Ваш ответ сохранён.' });
      setRoomSearchQuery('');
      setForm({
        room_id: '',
        ...QUESTIONS.reduce((acc, q) => {
          acc[q.key] = null;
          acc[q.commentKey] = '';
          return acc;
        }, {}),
      });
    } catch (err) {
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
          <legend className="survey-legend">Номер комнаты</legend>
          <div className="survey-room-combobox" ref={roomDropdownRef}>
            <input
              type="text"
              className="survey-room-input"
              placeholder="Введите номер или название"
              value={roomDropdownOpen ? roomSearchQuery : selectedRoomName || roomSearchQuery}
              onChange={(e) => {
                setRoomSearchQuery(e.target.value);
                setRoomDropdownOpen(true);
                if (form.room_id) setForm((prev) => ({ ...prev, room_id: '' }));
              }}
              onFocus={() => {
                setRoomDropdownOpen(true);
                if (form.room_id && !roomSearchQuery) setRoomSearchQuery(selectedRoomName);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setRoomDropdownOpen(false);
                  e.target.blur();
                }
              }}
              autoComplete="off"
            />
            {roomDropdownOpen && (
              <ul className="survey-room-dropdown" role="listbox">
                {filteredRooms.length === 0 ? (
                  <li className="survey-room-dropdown-item survey-room-dropdown-item--empty">
                    Нет подходящих комнат
                  </li>
                ) : (
                  filteredRooms.map((r) => (
                    <li
                      key={r.id}
                      role="option"
                      className="survey-room-dropdown-item"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setForm((prev) => ({ ...prev, room_id: String(r.id) }));
                        setRoomSearchQuery('');
                        setRoomDropdownOpen(false);
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
            <legend className="survey-legend">{q.label}</legend>
            {q.hint && <span className="survey-hint">{q.hint}</span>}
            <div className="survey-radios">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="survey-label">
                  <input
                    type="radio"
                    name={q.key}
                    value={n}
                    checked={form[q.key] === n}
                    onChange={() => setRating(q.key, n)}
                    className="survey-radio"
                  />
                  <span className="survey-radio-text">{n}</span>
                </label>
              ))}
            </div>
            <textarea
              className="survey-comment"
              rows={3}
              maxLength={2000}
              placeholder="Здесь вы можете описать, что именно не понравилось или понравилось (до 2000 символов)"
              value={form[q.commentKey]}
              onChange={(e) => setComment(q.commentKey, e.target.value)}
            />
          </fieldset>
        ))}

        {message && (
          <p className={`survey-message survey-message--${message.type}`}>
            {message.text}
          </p>
        )}

        <button
          type="submit"
          disabled={!allFilled || loading}
          className="survey-submit"
        >
          {loading ? 'Отправка...' : 'Отправить'}
        </button>
      </form>
    </section>
  );
}
