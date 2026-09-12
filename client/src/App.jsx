import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import PlayerPage from './pages/PlayerPage';
import DisplayPage from './pages/DisplayPage';
import HostPage from './pages/HostPage';
import EditorPage from './pages/EditorPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/play/:gameCode" element={<PlayerPage />} />
      <Route path="/display/:gameCode" element={<DisplayPage />} />
      <Route path="/host/:gameCode" element={<HostPage />} />
      <Route path="/editor" element={<EditorPage />} />
      <Route path="/editor/:boardId" element={<EditorPage />} />
    </Routes>
  );
}
