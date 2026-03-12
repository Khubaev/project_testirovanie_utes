import SurveyForm from './pages/SurveyForm.jsx';
import './App.css';

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="logo-wrap">
            <h1 className="logo">УТЁС</h1>
            <p className="logo-sub">СЕМЕЙНЫЙ КУРОРТ</p>
          </div>
        </div>
      </header>
      <main className="main">
        <SurveyForm />
      </main>
    </div>
  );
}
