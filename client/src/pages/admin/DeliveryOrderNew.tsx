import { useNavigate } from 'react-router-dom';
import { useAdminQuery } from '../../components/admin/hooks';
import { AdminPage } from '../../components/admin/ui';
import { DeliveryOrderForm } from '../../components/delivery/DeliveryOrderForm';
import { useAdmin } from '../../context/AdminAuth';
import { hasPerm } from '../../context/Auth';
import { useSite } from '../../context/SiteContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import { useDocumentTitle } from '../../lib/useAsync';

/** إنشاء طلب توصيل من الإدارة باسم مورد */
export default function DeliveryOrderNew() {
  useDocumentTitle('طلب توصيل جديد');
  const navigate = useNavigate();
  const { toast } = useToast();
  const { admin } = useAdmin();
  const suppliers = useAdminQuery(() => api.get<{ id: string; name: string }[]>('/admin/delivery/suppliers'), []);
  const { settings } = useSite();
  return (
    <AdminPage title="طلب توصيل جديد" back={{ to: '/admin/delivery?tab=orders', label: 'الطلبات' }}>
      <DeliveryOrderForm
        suppliers={suppliers.data ?? []}
        feeEditable={hasPerm(admin, 'orders.editAmounts')}
        defaultFee={settings.deliveryFeeDefault ?? 3}
        onSubmit={async (body) => {
          const o = await api.post<{ id: string; code: string }>('/admin/delivery/orders', body);
          toast(`تم إنشاء الطلب ${o.code}`);
          navigate(`/admin/delivery/orders/${o.id}`, { replace: true });
        }}
      />
    </AdminPage>
  );
}
