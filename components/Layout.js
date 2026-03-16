import Nav from './Nav'
import BottomNav from './BottomNav'

export default function Layout({ children }) {
  return (
    <>
      <Nav />
      {children}
      <BottomNav />
    </>
  )
}
