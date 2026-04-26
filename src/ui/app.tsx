import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { LibraryScreen } from './library/LibraryScreen';
import { PlayScreen } from './play/PlayScreen';

const router = createBrowserRouter([
    { path: '/', element: <LibraryScreen /> },
    { path: '/play/:profileId', element: <PlayScreen /> },
]);

export function App() {
    return <RouterProvider router={router} />;
}
