declare global {
  interface Window {
    FB: {
      init: (params: object) => void;
      login: (cb: (r: FBLoginResponse) => void, opts?: object) => void;
    };
    fbAsyncInit: () => void;
  }
}

interface FBLoginResponse {
  status: "connected" | "not_authorized" | "unknown";
  authResponse?: {
    accessToken: string;
    expiresIn: number;
    userID: string;
  };
}

export interface MetaAdAccount {
  id: string;
  name: string;
  account_status: number;
}

export interface MetaPage {
  id: string;
  name: string;
  access_token?: string;
  fan_count?: number;
  followers_count?: number;
  instagram_business_account?: {
    id: string;
    username?: string;
    profile_picture_url?: string;
  };
  picture?: {
    data?: {
      url?: string;
    };
  };
}

let sdkReady = false;

export function loadFacebookSDK(appId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (sdkReady) { resolve(); return; }

    window.fbAsyncInit = () => {
      window.FB.init({ appId, cookie: true, xfbml: false, version: "v21.0" });
      sdkReady = true;
      resolve();
    };

    if (document.getElementById("facebook-jssdk")) { resolve(); return; }

    const s = document.createElement("script");
    s.id = "facebook-jssdk";
    s.src = "https://connect.facebook.net/pt_BR/sdk.js";
    s.onerror = () => reject(new Error("Falha ao carregar o SDK do Facebook"));
    document.body.appendChild(s);
  });
}

export function facebookLogin(): Promise<string> {
  return new Promise((resolve, reject) => {
    window.FB.login(
      (res) => {
        if (res.status === "connected" && res.authResponse?.accessToken) {
          resolve(res.authResponse.accessToken);
        } else {
          reject(new Error("Login cancelado ou não autorizado pelo usuário"));
        }
      },
      { scope: "ads_read,ads_management,business_management,pages_show_list,pages_read_engagement", auth_type: "rerequest" }
    );
  });
}
