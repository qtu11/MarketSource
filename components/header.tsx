"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Menu, ShoppingCart, User, Wallet, LogOut, Settings } from 'lucide-react'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { RankBadge } from '@/components/rank-badge'
import { logger } from "@/lib/logger-client"
import { toast } from "sonner"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

export function Header() {
  const pathname = usePathname()
  const [cartCount, setCartCount] = useState(0)
  const [user, setUser] = useState<any>(null)
  const [balance, setBalance] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)

    // Load cart count
    const loadCartCount = () => {
      try {
        const cartItems = JSON.parse(localStorage.getItem('cartItems') || '[]')
        setCartCount(cartItems.reduce((total: number, item: any) => total + (item.quantity || 1), 0))
      } catch (error) {
        logger.error('Error loading cart:', error)
        setCartCount(0)
      }
    }

    // Load user data
    const loadUserData = () => {
      try {
        const userData = localStorage.getItem('currentUser')
        const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true'
        if (userData && isLoggedIn) {
          const parsedUser = JSON.parse(userData)
          setUser(parsedUser)
          setBalance(parsedUser.balance || 0)

          if (!sessionStorage.getItem('welcomeShown')) {
            setTimeout(() => {
              toast.success(`Chào mừng ${parsedUser.name || parsedUser.email} đã quay lại!`, {
                description: 'Chúc bạn một ngày làm việc hiệu quả.',
                duration: 4000,
              });
            }, 1000)
            sessionStorage.setItem('welcomeShown', 'true')
          }
        } else {
          setUser(null)
          setBalance(0)
        }
      } catch (error) {
        logger.error('Error loading user data:', error)
        setUser(null)
        setBalance(0)
      }
    }

    loadCartCount()
    loadUserData()

    // Listen for cart updates
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'cartItems') {
        loadCartCount()
      }
      if (e.key === 'currentUser' || e.key === 'isLoggedIn') {
        loadUserData()
      }
    }

    const handleCartUpdate = () => {
      loadCartCount()
    }

    const handleUserUpdate = () => {
      loadUserData()
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('cartUpdated', handleCartUpdate)
    window.addEventListener('userUpdated', handleUserUpdate)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('cartUpdated', handleCartUpdate)
      window.removeEventListener('userUpdated', handleUserUpdate)
    }
  }, [])

  const handleLogout = () => {
    try {
      localStorage.removeItem('currentUser')
      localStorage.removeItem('isLoggedIn')
      setUser(null)
      setBalance(0)
      window.dispatchEvent(new Event('userUpdated'))
      window.location.href = '/'
    } catch (error) {
      logger.error('Error during logout:', error)
    }
  }

  const navigation = [
    { name: 'Trang chủ', href: '/' },
    { name: 'Sản phẩm', href: '/products' },
    { name: 'Danh mục', href: '/categories' },
    { name: 'Hỗ trợ', href: '/support' },
  ]

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/'
    }
    return pathname?.startsWith(href) || false
  }

  if (!mounted) {
    return (
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Logo />
          <div className="flex items-center space-x-4">
            <ThemeToggle />
          </div>
        </div>
      </header>
    )
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 liquid-glass animate-fade-in-down">
      <div className="container flex h-16 items-center justify-between smooth-transition">
        <div className="flex items-center space-x-4">
          <Logo />

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            {navigation.map((item) => (
              <Link
                key={item.name}
                href={item.href}
                className={`text-sm font-medium transition-all duration-300 hover:text-primary relative group ${isActive(item.href)
                    ? 'text-primary'
                    : 'text-muted-foreground'
                  }`}
              >
                {item.name}
                <span className={`absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-300 group-hover:w-full ${isActive(item.href) ? 'w-full' : ''
                  }`} />
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center space-x-4">
          <ThemeToggle />

          {/* Cart */}
          <Link href="/cart">
            <Button variant="ghost" size="sm" className="relative hover-lift smooth-transition">
              <ShoppingCart className="h-5 w-5 group-hover:animate-bounce" />
              {cartCount > 0 && (
                <Badge
                  variant="destructive"
                  className="absolute -top-2 -right-2 h-5 w-5 flex items-center justify-center p-0 text-xs animate-bounce-in hover-glow"
                >
                  {cartCount}
                </Badge>
              )}
            </Button>
          </Link>

          {/* User Menu */}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full hover-lift smooth-transition">
                  <Avatar className="h-8 w-8 hover-glow">
                    <AvatarFallback className="bg-gradient-to-r from-purple-600 to-pink-600 text-white animate-gradient">
                      {user.name ? user.name.charAt(0).toUpperCase() : user.email?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium leading-none">
                        {user.name || user.email}
                      </p>
                      <RankBadge rank={user.rank || 'Script Kiddie'} showLabel={false} className="px-1 py-0 h-3.5" />
                    </div>
                    <p className="text-xs leading-none text-muted-foreground">
                      {user.email}
                    </p>
                    <p className="text-xs leading-none text-muted-foreground">
                      Số dư: {balance.toLocaleString('vi-VN')}đ
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard" className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    <span>Dashboard</span>
                  </Link>
                </DropdownMenuItem>
                {user?.role === "admin" && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin" className="cursor-pointer">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Admin control</span>
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/deposit" className="cursor-pointer">
                    <Wallet className="mr-2 h-4 w-4" />
                    <span>Nạp tiền</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/withdraw" className="cursor-pointer">
                    <Wallet className="mr-2 h-4 w-4" />
                    <span>Rút tiền</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-red-600">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Đăng xuất</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center space-x-2">
              <Button asChild variant="ghost" size="sm" className="hover-lift smooth-transition">
                <Link href="/auth/login">Đăng nhập</Link>
              </Button>
              <Button asChild size="sm" className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 hover-lift hover-glow animate-gradient">
                <Link href="/auth/register">Đăng ký</Link>
              </Button>
            </div>
          )}

          {/* Mobile Menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px] sm:w-[400px]">
              <div className="flex flex-col space-y-4 mt-4">
                <Logo />
                <nav className="flex flex-col space-y-2">
                  {navigation.map((item) => (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`text-sm font-medium transition-colors hover:text-primary p-2 rounded-md ${isActive(item.href)
                          ? 'text-primary bg-primary/10'
                          : 'text-muted-foreground'
                        }`}
                    >
                      {item.name}
                    </Link>
                  ))}
                </nav>

                {user ? (
                  <div className="flex flex-col space-y-2 pt-4 border-t">
                    <div className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{user.name || user.email}</p>
                        <RankBadge rank={user.rank || 'Script Kiddie'} showLabel={false} className="px-1 py-0 h-3.5" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Số dư: {balance.toLocaleString('vi-VN')}đ
                      </p>
                    </div>
                    <Button asChild variant="outline">
                      <Link href="/dashboard">Dashboard</Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href="/deposit">Nạp tiền</Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href="/withdraw">Rút tiền</Link>
                    </Button>
                    <Button onClick={handleLogout} variant="destructive">
                      Đăng xuất
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col space-y-2 pt-4 border-t">
                    <Button asChild variant="outline">
                      <Link href="/auth/login">Đăng nhập</Link>
                    </Button>
                    <Button asChild className="bg-purple-600 hover:bg-purple-700">
                      <Link href="/auth/register">Đăng ký</Link>
                    </Button>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}

export default Header
