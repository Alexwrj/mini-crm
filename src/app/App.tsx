import { Link, NavLink, Outlet, Route, Routes } from 'react-router'
import { LoginPage } from '../pages/LoginPage'
import { ObjectsPage } from '../pages/ObjectsPage'
import { ObjectPage } from '../pages/ObjectPage'
import { TaskPage } from '../pages/TaskPage'
import { MyTasksPage } from '../pages/MyTasksPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/features/auth/model/auth-context'
import { HomeRedirect, ProtectedRoutes } from '@/features/auth/ui/AuthGate'

function Layout() {
  const { state, signOut } = useAuth()
  return (
    <div className="mx-auto max-w-[1040px] p-6">
      <header className="flex flex-wrap items-center justify-between gap-6">
        <Link className="text-xl leading-[normal] font-bold text-foreground underline underline-offset-[3px] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ring" to="/objects">Объекты и задачи</Link>
        <nav className="flex flex-wrap gap-5" aria-label="Основная навигация">
          <NavLink className="text-primary underline underline-offset-[3px] aria-[current=page]:font-bold focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ring" to="/objects">Объекты</NavLink>
          <NavLink className="text-primary underline underline-offset-[3px] aria-[current=page]:font-bold focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ring" to="/my-tasks">Мои задачи</NavLink>
          {state.status === 'authenticated' && <>
            <Badge variant="secondary">{state.profile.role === 'manager' ? 'Постановщик' : 'Исполнитель'}</Badge>
            <Button variant="outline" onClick={() => void signOut()}>Выйти</Button>
          </>}
          {state.status === 'anonymous' && <NavLink className="text-primary underline underline-offset-[3px] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ring" to="/login">Вход</NavLink>}
        </nav>
      </header>
      <main id="main-content" className="mt-9">
        <p className="my-4 leading-[1.6] text-muted-foreground">Stage 3A · Авторизация подключена. Доступ к бизнес-данным пока закрыт.</p>
        <Outlet />
      </main>
    </div>
  )
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomeRedirect />} />
        <Route path="login" element={<LoginPage />} />
        <Route element={<ProtectedRoutes />}>
          <Route path="objects" element={<ObjectsPage />} />
        <Route path="objects/:objectId" element={<ObjectPage />} />
        <Route path="tasks/:taskId" element={<TaskPage />} />
        <Route path="my-tasks" element={<MyTasksPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
