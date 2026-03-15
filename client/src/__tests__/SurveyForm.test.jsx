import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SurveyForm from '../pages/SurveyForm.jsx';

// Мокируем api.js
vi.mock('../api.js', () => ({
  getOrCreateDeviceId: () => 'test-device-uuid-1234-5678-9012',
  checkSubmittedOnServer: vi.fn(),
  markAsSubmitted: vi.fn(),
  clearSubmittedFlag: vi.fn(),
  clearDraft: vi.fn(),
  saveDraft: vi.fn(),
  loadDraft: vi.fn(() => null),
  submitSurvey: vi.fn(),
  getRooms: vi.fn(),
}));

import {
  checkSubmittedOnServer,
  submitSurvey,
  getRooms,
  saveDraft,
  loadDraft,
} from '../api.js';

beforeEach(() => {
  vi.clearAllMocks();
  checkSubmittedOnServer.mockResolvedValue(false);
  getRooms.mockResolvedValue([]);
  loadDraft.mockReturnValue(null);
  localStorage.clear();
});

describe('SurveyForm — состояния загрузки', () => {
  it('показывает «Загрузка...» пока идёт проверка', () => {
    checkSubmittedOnServer.mockReturnValue(new Promise(() => {})); // never resolves
    render(<SurveyForm />);
    expect(screen.getByText('Загрузка...')).toBeInTheDocument();
  });

  it('показывает форму когда пользователь не отправлял анкету', async () => {
    render(<SurveyForm />);
    await waitFor(() => {
      expect(screen.getByText('Пожалуйста, оцените по шкале от 1 до 5')).toBeInTheDocument();
    });
  });

  it('показывает экран «уже отправлено» когда сервер подтверждает', async () => {
    checkSubmittedOnServer.mockResolvedValue(true);
    render(<SurveyForm />);
    await waitFor(() => {
      expect(screen.getByText(/Вы уже отправили анкету/)).toBeInTheDocument();
    });
  });
});

describe('SurveyForm — кнопки рейтинга', () => {
  it('кнопки рейтинга 1-5 отображаются для каждого вопроса', async () => {
    render(<SurveyForm />);
    await waitFor(() => {
      // 6 вопросов × 5 кнопок = 30 кнопок с aria-label "Оценка N"
      const ratingBtns = screen.getAllByRole('button', { name: /Оценка [1-5]/ });
      expect(ratingBtns.length).toBe(30);
    });
  });

  it('кнопка «Отправить» недоступна пока не заполнены обязательные вопросы', async () => {
    render(<SurveyForm />);
    await waitFor(() => {
      const submitBtn = screen.getByRole('button', { name: 'Отправить' });
      expect(submitBtn).toBeDisabled();
    });
  });

  it('кнопка «Отправить» становится доступной после заполнения всех обязательных вопросов', async () => {
    const user = userEvent.setup();
    render(<SurveyForm />);
    await waitFor(() => {
      expect(screen.getByText('Пожалуйста, оцените по шкале от 1 до 5')).toBeInTheDocument();
    });

    // Нажимаем оценку 4 для каждого из 4 обязательных вопросов
    const btns4 = screen.getAllByRole('button', { name: 'Оценка 4' });
    // Берём первые 4 (обязательные вопросы)
    for (let i = 0; i < 4; i++) {
      await user.click(btns4[i]);
    }

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Отправить' })).not.toBeDisabled();
    });
  });
});

describe('SurveyForm — прогресс-счётчик', () => {
  it('показывает «0 / 4 оценено» в начале', async () => {
    render(<SurveyForm />);
    await waitFor(() => {
      expect(screen.getByText('0 / 4 оценено')).toBeInTheDocument();
    });
  });

  it('обновляет счётчик при выборе оценок', async () => {
    const user = userEvent.setup();
    render(<SurveyForm />);
    await waitFor(() => {
      expect(screen.getByText('0 / 4 оценено')).toBeInTheDocument();
    });

    const btn5 = screen.getAllByRole('button', { name: 'Оценка 5' });
    await user.click(btn5[0]);
    expect(screen.getByText('1 / 4 оценено')).toBeInTheDocument();
  });
});

describe('SurveyForm — необязательные вопросы', () => {
  it('показывает подсказку для необязательных вопросов без оценки', async () => {
    render(<SurveyForm />);
    await waitFor(() => {
      const hints = screen.getAllByText('Не оценивайте, если не пользовались этой услугой');
      expect(hints.length).toBe(2); // food + service_zone
    });
  });
});

describe('SurveyForm — отправка формы', () => {
  it('вызывает submitSurvey и переходит в «уже отправлено»', async () => {
    submitSurvey.mockResolvedValue({ id: 1, ok: true });
    const user = userEvent.setup();
    render(<SurveyForm />);
    await waitFor(() => {
      expect(screen.getByText('Пожалуйста, оцените по шкале от 1 до 5')).toBeInTheDocument();
    });

    // Заполняем все 4 обязательных вопроса оценкой 5
    const btns5 = screen.getAllByRole('button', { name: 'Оценка 5' });
    for (let i = 0; i < 4; i++) {
      await user.click(btns5[i]);
    }

    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    await waitFor(() => {
      expect(submitSurvey).toHaveBeenCalledOnce();
      expect(screen.getByText(/Вы уже отправили анкету/)).toBeInTheDocument();
    });
  });

  it('показывает ошибку при неудачной отправке', async () => {
    submitSurvey.mockRejectedValue(new Error('Ошибка сети'));
    const user = userEvent.setup();
    render(<SurveyForm />);
    await waitFor(() => {
      expect(screen.getByText('Пожалуйста, оцените по шкале от 1 до 5')).toBeInTheDocument();
    });

    const btns3 = screen.getAllByRole('button', { name: 'Оценка 3' });
    for (let i = 0; i < 4; i++) {
      await user.click(btns3[i]);
    }

    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    await waitFor(() => {
      expect(screen.getByText('Ошибка сети')).toBeInTheDocument();
    });
  });
});

describe('SurveyForm — автосохранение черновика', () => {
  it('вызывает saveDraft при изменении оценки', async () => {
    const user = userEvent.setup();
    render(<SurveyForm />);
    await waitFor(() => {
      expect(screen.getByText('Пожалуйста, оцените по шкале от 1 до 5')).toBeInTheDocument();
    });

    const btn2 = screen.getAllByRole('button', { name: 'Оценка 2' });
    await user.click(btn2[0]);
    expect(saveDraft).toHaveBeenCalled();
  });

  it('восстанавливает черновик из localStorage', async () => {
    loadDraft.mockReturnValue({
      room_id: '',
      service_quality: 3,
      service_comment: '',
      cost_rating: null,
      cost_comment: '',
      cleaning_quality: null,
      cleaning_comment: '',
      reception_quality: null,
      reception_comment: '',
      food_quality: null,
      food_comment: '',
      service_zone_quality: null,
      service_zone_comment: '',
    });

    render(<SurveyForm />);
    await waitFor(() => {
      // Оценка 3 для первого вопроса должна быть выбрана (aria-pressed=true)
      const btn3 = screen.getAllByRole('button', { name: 'Оценка 3' });
      expect(btn3[0]).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
