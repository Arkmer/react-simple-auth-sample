import { guid } from '../services/utilities'

export interface IProvider<T> {
    buildAuthorizeUrl(): string
    extractError(redirectUrl: string): Error | undefined
    extractSession(redirectUrl: string): T
    validateSession(session: T): boolean
}

export interface IAuthenticationService {
    acquireTokenAsync<T>(provider: IProvider<T>): Promise<T>
    restoreSession<T>(provider: IProvider<T>): T | undefined
}

export const service: IAuthenticationService = {
    acquireTokenAsync<T>(provider: IProvider<T>): Promise<T> {
        // Create unique request key
        const requestKey = `requestKey_${guid()}`
        // Set request key as empty in local storage
        window.localStorage.setItem(requestKey, '')
        // Create new window set to authorize url, with unique request key, and centered options
        const [width, height] = [500, 500]
        const windowOptions = {
            width,
            height,
            left: Math.floor(screen.width / 2 - width / 2) + ((screen as any).availLeft || 0),
            top: Math.floor(screen.height / 2 - height / 2)
        }

        const oauthAuthorizeUrl = provider.buildAuthorizeUrl()
        const windowOptionString = Object.entries(windowOptions).map(([key, value]) => `${key}=${value}`).join(',')
        const loginWindow = window.open(oauthAuthorizeUrl, requestKey, windowOptionString)

        return new Promise<any>((resolve, reject) => {
            // Poll for when the is closed
            const checkWindow = (loginWindow: Window) => {
                // If window is still open check again later
                if (!loginWindow.closed) {
                    setTimeout(() => checkWindow(loginWindow), 100)
                    return
                }

                const redirectUrl = window.localStorage.getItem(requestKey)
                window.localStorage.removeItem(requestKey)

                // Window was closed, but never reached the redirect.html due to user closing window or network error during authentication
                if (typeof redirectUrl !== 'string' || redirectUrl.length === 0) {
                    reject(new Error(`React Simple Auth: Login window was closed by the user or authentication was incomplete and never reached final redirect page.`))
                    return
                }

                // Window was closed, and reached the redirect.html; however there still might have been error during authentication, check url
                const error = provider.extractError(redirectUrl)
                if (error) {
                    reject(error)
                    return
                }

                // Window was closed, reached redirect.html and correctly added tokens to the url
                const session = provider.extractSession(redirectUrl)
                window.localStorage.setItem('session', JSON.stringify(session))
                resolve(session)
            }

            checkWindow(loginWindow)
        })
    },

    restoreSession<T>(provider: IProvider<T>): T | undefined {
        const sessionString = window.localStorage.getItem('session')
        if (typeof sessionString !== 'string' || sessionString.length === 0) {
            return undefined
        }

        const session: T = JSON.parse(sessionString)
        return provider.validateSession(session)
            ? session
            : undefined
    }
}
