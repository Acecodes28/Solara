import { FieldView } from '@/components/FieldView';

export const dynamic = 'force-dynamic';

export default function FieldPage({ params }: { params: { id: string } }) {
  return <FieldView params={params} />;
}
