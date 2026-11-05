import { Link, NavLink, Navigate, Outlet, Route, Routes } from 'react-router'
import { LoginPage } from '../pages/LoginPage'
import { ObjectsPage } from '../pages/ObjectsPage'
import { ObjectPage } from '../pages/ObjectPage'
import { TaskPage } from '../pages/TaskPage'
import { MyTasksPage } from '../pages/MyTasksPage'
import { NotFoundPage } from '../pages/NotFoundPage'

function Layout() {
  return (
    <div className="mx-auto max-w-[1040px] p-6">
      <header className="flex flex-wrap items-center justify-between gap-6">
        <Link className="text-xl leading-[normal] font-bold text-foreground underline underline-offset-[3px] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ring" to="/objects">Объекты и задачи</Link>
        <nav className="flex flex-wrap gap-5" aria-label="Основная навигация">
          <NavLink className="text-primary underline underline-offset-[3px] aria-[current=page]:font-bold focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ring" to="/objects">Объекты</NavLink>
          <NavLink className="text-primary underline underline-offset-[3px] aria-[current=page]:font-bold focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ring" to="/my-tasks">Мои задачи</NavLink>
          <NavLink className="text-primary underline underline-offset-[3px] aria-[current=page]:font-bold focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ring" to="/login">Вход</NavLink>
        </nav>
      </header>
      <main id="main-content" className="mt-9">
        <p className="my-4 leading-[1.6] text-muted-foreground">Foundation · Экраны-заглушки. База данных не подключена.</p>
        <Outlet />
      </main>
    </div>
  )
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/objects" replace />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="objects" element={<ObjectsPage />} />
        <Route path="objects/:objectId" element={<ObjectPage />} />
        <Route path="tasks/:taskId" element={<TaskPage />} />
        <Route path="my-tasks" element={<MyTasksPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
