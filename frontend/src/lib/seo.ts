export const SITE_URL = 'https://mavva.com.br'
export const SITE_NAME = 'Mavva'
export const SITE_TITLE = 'Mavva: quiz bíblico diário | Estude a Bíblia todo dia'
export const SITE_DESCRIPTION =
  'O Mavva é um app gratuito para estudar a Bíblia de um jeito leve e divertido. Faça quizzes, revise o que aprendeu, desafie amigos em duelos e acompanhe seu progresso — um pouco de maná novo a cada manhã.'

export function setPageMeta({
  title,
  description,
  robots,
}: {
  title?: string
  description?: string
  robots?: string
}) {
  if (title) document.title = title

  const desc = document.querySelector('meta[name="description"]')
  if (description && desc) desc.setAttribute('content', description)

  let robotsTag = document.querySelector('meta[name="robots"]')
  if (robots) {
    if (!robotsTag) {
      robotsTag = document.createElement('meta')
      robotsTag.setAttribute('name', 'robots')
      document.head.appendChild(robotsTag)
    }
    robotsTag.setAttribute('content', robots)
  } else if (robotsTag) {
    robotsTag.remove()
  }
}
