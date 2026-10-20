import React, { Component } from 'react';
import {kc,getUser} from '../api/UserManager';
import {KEYCLOAK_URL, KEYCLOAK_REALM} from '../consts';
import { Button } from './ui';

const MENU_ITEM = 'block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 cursor-pointer';

class LoginPage extends Component {

    state = {
        disabled: true,
        loading: true,
    };

    componentDidMount() {
        this.appLogin();
    };

    appLogin = () => {
        getUser((user) => {
            if(user) {
                console.log("Got user: ", user)
                this.setState({loading: false});
                this.props.checkPermission(user);
            } else {
                this.setState({disabled: false, loading: false});
            }
        });
    };

    userLogin = () => {
        this.setState({disabled: true, loading: true});
        kc.login({redirectUri: window.location.href});
    };


    render() {

        const {disabled, loading} = this.state;

        let login = (<Button variant='primary' size='xl' onClick={this.userLogin} disabled={disabled} loading={loading}>Login</Button>);
        let profile = (
            <details className='relative inline-block align-middle text-base font-normal'>
                <summary className='cursor-pointer list-none px-2 text-slate-500 hover:text-slate-900'>▾</summary>
                <div className='absolute left-0 z-10 mt-1 w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg'>
                    <div className='px-4 py-2 text-sm text-slate-400'>Profile:</div>
                    <button type='button' className={MENU_ITEM}
                            onClick={() => window.open(`${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/account`, "_blank")}>
                        My Account
                    </button>
                    <button type='button' className={MENU_ITEM} onClick={() => kc.logout()}>Sign Out</button>
                </div>
            </details>);

        return (
            <div className='mx-auto max-w-5xl px-4 py-6 text-center'>
                <div className='rounded-lg border border-slate-200 bg-slate-50 p-8 text-xl shadow-sm'>
                    <div className='mb-6 text-3xl font-bold text-slate-900'>
                        {this.props.user === null ? "Transcription" : "Hello, "+this.props.user.username}
                        {this.props.user === null ? "" : profile}
                    </div>
                    {this.props.user === null ? login : this.props.enter}
                </div>
            </div>
        );
    }
}

export default LoginPage;
