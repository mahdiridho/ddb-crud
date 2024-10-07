import { LitElement, html, css } from 'lit';
import { CognitoIdentityClient } from "@aws-sdk/client-cognito-identity";
import { fromCognitoIdentityPool } from "@aws-sdk/credential-provider-cognito-identity";
import { CognitoIdentityProviderClient, InitiateAuthCommand } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

class NoobApp extends LitElement {
  static get properties() {
    return {
      userPoolName: { type: String }, // User Pool Name
      userPoolId: { type: String }, // User Pool ID
      region: { type: String }, // aws region
      clientId: { type: String }, // App Client ID
      identityPool: { type: String }, // Identity Pool ID
      ddbTable: { type: String }, // DDB Table name
      auth: { type: Boolean }, // is session autenticated
      code: { type: String }, // OAUTH2 authorization code
    };
  }

  constructor() {
    super();
    this.auth = false;
  }

  static get styles() {
    return css`
      :host {
        display: block;
        margin: 5px;
      }
    `;
  }

  render() {
    return html`
      <div ?hidden="${this.auth}">
        <button @click="${this.login}">login</button>
      </div>
      <div ?hidden="${!this.auth}">
        <input type="button" value="Logout" @click="${this.logout}" />
      </div>
    `
  }

  updated(updates) {
    // if (updates.has('region')) {
    // }
  }

  firstUpdated() {
    // initiate callback process from Host UI window
    this.re = new RegExp(/^.*\//);
    let urlRefer = window.location.href.replace("#", "?");
    let url = new URL(urlRefer);

    if (url.searchParams.get("error_description")) {
      alert(url.searchParams.get("error_description"));
      window.close();
    } else if (url.searchParams.get("code")) {
      window.opener.postMessage({ code: url.searchParams.get("code") }, this.re.exec(window.location.href)[0]);
      window.close();
    }

    // populate backend information
    fetch('./src/config.json').then(response => { // load the file data
      return response.json()
    }).then(async (json) => {
      this.userPoolName = json.poolname;
      this.userPoolId = json.poolid;
      this.region = json.region;
      this.clientId = json.clientId;
      this.identityPool = json.identitypool;
      this.ddbTable = json.ddbTable;

      // check login session, refresh the tokens if expired
      if (window.sessionStorage.getItem("tokens")) {
        if (!this.isTokenExpired()) {
          const tokens = JSON.parse(window.sessionStorage.getItem("tokens"));
          return this.getCredentials(tokens);
        } else {
          return this.refreshToken();
        }
      }
    })
  }

  /** Once click login event, Open popup login redirect to User Pool Domain Name
  Initialize a cognito auth object.
  */
  login() {
    let missingMsg = "";
    if (!this.clientId)
      missingMsg = "Missing required client Id";
    if (!this.userPoolName)
      missingMsg = "Missing required pool name";
    if (!this.userPoolId)
      missingMsg = "Missing required pool id";
    if (!this.identityPool)
      missingMsg = "Missing required identity pool id";
    if (!this.region)
      missingMsg = "Missing required aws region";

    if (missingMsg) {
      return alert(missingMsg);
    }

    // prompt the Cognito Host UI login
    let w = window.open('https://' + this.userPoolName + '.auth.' + this.region + '.amazoncognito.com/login?client_id=' + this.clientId + '&response_type=code&redirect_uri=' + this.re.exec(window.location.href)[0].slice(0, -1) + '&scope=email+profile+openid', 'popup', 'width=600,height=600');
    w.document.title = "User Authentication";

    // listening callback message from Host UI window
    window.addEventListener("message", async e => {
      if (e.data.code) {
        // request OAUTH2 tokens
        await this.getToken(e.data.code);
      }
    }, false);
    window.addEventListener("error", (e) => {
      console.log(`Error: ${e.message}`)
    }, false);
  }

  async getToken(code) {
    if (code.length > 36)
      code = code.slice(0, -1);
    let redirectUri = encodeURIComponent(this.re.exec(window.location.href)[0].slice(0, -1));
    let data = "grant_type=authorization_code&scope=" + encodeURIComponent('email openid profile') + "&redirect_uri=" + redirectUri + "&client_id=" + this.clientId + "&code=" + code;
    let resToken = await fetch('https://' + this.userPoolName + '.auth.' + this.region + '.amazoncognito.com/oauth2/token?' + data, {
      'method': 'POST',
      'headers': {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    const tokens = await resToken.json();

    // exchange the tokens with AWS temporary credentials
    await this.getCredentials(tokens);
  }

  /** Refresh the OAUTH2 tokens
  */
  async refreshToken() {
    const tokens = JSON.parse(window.sessionStorage.getItem("tokens"));
    let params = {
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: this.clientId,
      AuthParameters: {
        "REFRESH_TOKEN": tokens.refresh_token,
        "DEVICE_KEY": null
      }
    };
    // Initialize the Cognito Identity Provider client
    const client = new CognitoIdentityProviderClient({
      region: this.region
    });
    const data = await client.send(new InitiateAuthCommand(params));

    // exchange the tokens with AWS temporary credentials
    await this.getCredentials({
      id_token: data.AuthenticationResult.IdToken,
      access_token: data.AuthenticationResult.AccessToken,
      refresh_token: data.AuthenticationResult.RefreshToken || tokens.refresh_token,
      expires_in: data.AuthenticationResult.ExpiresIn
    });
  }

  isTokenExpired() {
    try {
      const tokens = window.sessionStorage.getItem("tokens");
      // Split the token into its parts
      const [, payload] = JSON.parse(tokens).id_token.split('.');
      // Decode the payload part (base64)
      const decodedPayload = JSON.parse(atob(payload));
      // Get the current time in seconds since the Unix epoch
      const currentTime = Math.floor(Date.now() / 1000);
      // Check if the token is expired
      return currentTime > decodedPayload.exp;
    } catch (error) {
      console.error("Invalid JWT token:", error);
      return true; // Treat invalid token as expired
    }
  }

  async getCredentials(tokens) {
    const cognitoClient = new CognitoIdentityClient({
      region: this.region
    });
    let url = 'cognito-idp.' + this.region + '.amazonaws.com/' + this.userPoolId;

    // request temporary credentials using cognito identity pool as an IAM trusted principal role
    const credentials = await fromCognitoIdentityPool({
      client: cognitoClient,
      identityPoolId: this.identityPool,
      logins: {
        [url]: tokens.id_token
      }
    })();
    window.sessionStorage.setItem("tokens", JSON.stringify(tokens));
    this.auth = true;

    // Initiate ddb client
    // Create a DynamoDB client
    const dynamoDBClient = new DynamoDBClient({ 
      region: this.region,
      credentials
    }); // Replace with your region

    // Create a DynamoDB Document client (wrapper) with default marshalling options
    const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

    // test put item
    await this.putItem(docClient);

    //test get item
    await this.getItem(docClient);

    // test query
    await this.query(docClient);

    // test delete item
    await this.delItem(docClient);
  }

  async putItem(docClient) {
    const params = {
      TableName: this.ddbTable,
      Item: {
        PK: "pk1",
        SK: "sk1",
        attrbute1: "abc"
      },
    };

    const response = await docClient.send(new PutCommand(params));
    console.log("Item successfully put:", response);
  }

  async getItem(docClient) {
    const params = {
      TableName: this.ddbTable,
      Key: {
        PK: "pk1",
        SK: "sk1"
      },
    };

    const response = await docClient.send(new GetCommand(params));
    console.log("Item retrieved:", response.Item);
  }

  async query(docClient) {
    const params = {
      TableName: this.ddbTable,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: {
        ":pk": "pk1"
      }
    };

    const response = await docClient.send(new QueryCommand(params));
    console.log("Query successful, items:", response.Items);
  }

  async delItem(docClient) {
    const params = {
      TableName: this.ddbTable,
      Key: {
        PK: "pk1",
        SK: "sk1"
      }
    };

    const response = await docClient.send(new DeleteCommand(params));
    console.log("Item successfully deleted:", response);
  }

  logout() {
    window.sessionStorage.clear();
    location.href = "/";
  }
}

window.customElements.define('noob-app', NoobApp);