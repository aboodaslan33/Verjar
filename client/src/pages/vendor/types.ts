import type { VendorTotals } from '../../components/admin/types';
import type { RequestStatus } from '../../lib/types';

export type VendorProfile = {
  id: string;
  name: string;
  slug: string;
  description: string;
  logoUrl: string | null;
  commissionPercent: number;
  phone: string | null;
  pickupAddress: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  verified?: boolean;
  contactName?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  businessField?: string | null;
  productTypes?: string | null;
  licenseNumber?: string | null;
  catalogFiles?: { url: string; name: string; kind: string }[];
  certificates?: { url: string; name: string; kind: string }[];
  categoryIds?: string[];
  isHouse?: boolean;
  createdAt: string;
};

export type VendorMe = {
  vendor: VendorProfile;
  totals: VendorTotals;
  counts: { products: number; pending: number; rejected: number; newOrders: number };
};

export type VendorOrder = {
  id: string;
  number: number;
  status: RequestStatus;
  subtotal: number;
  total: number;
  commissionTotal: number;
  vendorNet: number;
  payoutId: string | null;
  createdAt: string;
  updatedAt: string;
  order: { number: number; ref: string; customerName: string; phone: string; address: string; notes: string | null; createdAt: string };
  items: {
    id: string;
    productId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    unitFinalPrice: number;
    discountPercent: number;
    lineTotal: number;
    commissionPercent: number;
    commissionAmount: number;
    vendorNet: number;
  }[];
};
