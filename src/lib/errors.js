export function errorPresentation(error, resourceName = 'information') {
  if (error?.status === 401) {
    return { title: 'Your session has expired.', message: 'Please sign in again.' }
  }
  if (error?.status === 403) {
    return {
      title: "You don't have permission to access this resource.",
      message: 'Return to a household you can access or ask an owner for permission.',
    }
  }
  if (error?.status === 404) {
    return {
      title: `${resourceName} not found.`,
      message: 'It may have been removed or you may no longer have access to it.',
    }
  }
  if (error?.status === 429) {
    return { title: 'Too many requests.', message: error.message || 'Please wait a moment and try again.' }
  }
  if (error?.code === 'NETWORK_ERROR') {
    return {
      title: 'Unable to connect to PawOps.',
      message: 'Check your connection and try again.',
    }
  }
  return {
    title: `Unable to load ${resourceName.toLowerCase()}.`,
    message: 'Something went wrong. Please try again.',
  }
}

