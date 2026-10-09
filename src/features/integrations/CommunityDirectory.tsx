import { ExternalLink, Users } from 'lucide-react';
import { Badge } from '../../components/common/Badge';
import { Card } from '../../components/common/Card';
import { communities } from './catalog';

export function CommunityDirectory() {
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {communities.map(community => <Card key={community.id} glow="cyan">
      <div className="flex items-center gap-2 text-xs text-cyan-400"><Users size={16} />{community.category}</div>
      <h3 className="text-lg font-semibold text-white mt-3">{community.name}</h3>
      <div className="mt-3"><Badge variant={community.evidence === 'PUBLIC' ? 'green' : 'amber'}>{community.status}</Badge></div>
      <p className="text-sm text-slate-400 mt-4 leading-6">{community.description}</p>
      <p className="text-xs text-slate-500 mt-3">{community.checkedAt ? `Evidência conferida em ${new Date(community.checkedAt).toLocaleString('pt-BR', { timeZone: 'UTC' })} UTC` : community.evidence === 'OPERATOR' ? 'Informação do operador · confirmação pendente' : 'Participação não confirmada'}</p>
      <div className="flex flex-wrap gap-4 mt-5 text-sm">
        <a href={community.url} target="_blank" rel="noopener noreferrer" className="text-cyan-400 inline-flex items-center gap-1">Abrir plataforma <ExternalLink size={13} /></a>
        <a href={community.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-slate-300 hover:text-white">{community.evidence === 'PUBLIC' ? 'Ver evidência' : 'Consultar referência'}</a>
      </div>
    </Card>)}
  </div>;
}
