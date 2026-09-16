import { CONTROLLER, LEGAL_CONTACT_EMAIL } from './legal'

export function ControllerDetails() {
  return (
    <ul>
      <li>
        <strong>Controlador:</strong> {CONTROLLER.legalName}
      </li>
      <li>
        <strong>Nome fantasia:</strong> {CONTROLLER.tradeName}
      </li>
      <li>
        <strong>CNPJ:</strong> {CONTROLLER.cnpj}
      </li>
      <li>
        <strong>Sede:</strong> {CONTROLLER.address}
      </li>
      <li>
        <strong>Encarregado:</strong> {CONTROLLER.officer}, {CONTROLLER.officerRole.toLowerCase()}
      </li>
      <li>
        <strong>Contato:</strong>{' '}
        <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="font-extrabold text-leaf-700 underline">
          {LEGAL_CONTACT_EMAIL}
        </a>
      </li>
    </ul>
  )
}
