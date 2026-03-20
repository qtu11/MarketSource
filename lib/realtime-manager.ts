"use client"

import { logger } from './logger-client'

/**
 * RealtimeManager (Deprecated)
 * CƠ CHẾ NÀY ĐÃ BỊ LOẠI BỎ ĐỂ CHUYỂN SANG DỮ LIỆU THỰC TỪ API.
 * File này chỉ được giữ lại để tránh lỗi import ở các component cũ.
 */
export class RealtimeManager {
  private static instance: RealtimeManager
  private listeners: Map<string, Set<Function>> = new Map()

  private constructor() {
    logger.info('RealtimeManager is now running in stub mode. LocalStorage sync disabled.')
  }

  public static getInstance(): RealtimeManager {
    if (!RealtimeManager.instance) {
      RealtimeManager.instance = new RealtimeManager()
    }
    return RealtimeManager.instance
  }

  // Subscribe to updates (no-op)
  public subscribe(dataType: string, callback: Function): () => void {
    if (!this.listeners.has(dataType)) {
      this.listeners.set(dataType, new Set())
    }
    this.listeners.get(dataType)!.add(callback)
    return () => {
      this.listeners.get(dataType)?.delete(callback)
    }
  }

  // Getters return empty arrays to force components to use API
  public getUserData(userId?: string): any[] { return [] }
  public getAllUsers(): any[] { return [] }
  public getAllDeposits(): any[] { return [] }
  public getAllWithdrawals(): any[] { return [] }
  public getAllPurchases(): any[] { return [] }
  public getAllProducts(): any[] { return [] }
  public getUserPurchases(userId: string): any[] { return [] }
  public getUserDeposits(userEmail: string): any[] { return [] }
  public getUserWithdrawals(userEmail: string): any[] { return [] }

  // Mutation methods (return false or no-op)
  public updateUserBalance(userId: string, newBalance: number, adminId: string): boolean { return false }
  public processDeposit(depositId: string, approved: boolean, adminId: string): boolean { return false }
  public processWithdrawal(withdrawalId: string, approved: boolean, adminId: string): boolean { return false }
  public addPurchase(userId: string, product: any, amount: number): boolean { return false }

  public destroy() {
    this.listeners.clear()
  }
}

export const realtimeManager = RealtimeManager.getInstance()
