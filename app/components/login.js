'use nodent';'use strict'

let React = require('react')
let mori = require('mori')
let PropTypes = require('react').PropTypes
let Component = require('./component')

let AppActions = require('../actions/app-actions')

let InputRow = require('./forms').InputRow
let ErrorList = require('./misc').ErrorList

class LoginPage extends Component {
  render () {
    return <div className='login_page'>
      <LoginForm state={this.props.state}/>
    </div>
  }
}

LoginPage.propTypes = {
  state: PropTypes.any
}

class LoginForm extends Component {
  constructor () {
    super()
    this.handle_submit = this.handle_submit.bind(this)
  }

  render () {
    let state = this.props.state
    let loading = mori.get(state, 'loading')
    let errors = mori.get(state, 'errors')

    return <div className='login_form'>
      <img className='logo' src='static/images/itchio-white.svg'/>
      <div className='login_box'>
        <h1>Log in</h1>

        <form className='form' onSubmit={this.handle_submit}>
          <ErrorList {...{errors}}/>

          <InputRow label='Username' name='username' type='text' ref='username' autofocus disabled={loading}/>
          <InputRow label='Password' name='password' type='password' ref='password' disabled={loading}/>

          <div className='buttons'>
            <button className='button' disabled={loading}>Log in</button>
            <span> · </span>
            <a href='https://itch.io/user/forgot-password' target='_blank'>Forgot password</a>
          </div>
        </form>
      </div>
    </div>
  }

  handle_submit (event) {
    event.preventDefault()

    let username = this.refs.username
    let password = this.refs.password
    AppActions.login_with_password(username.value(), password.value())
  }
}

LoginForm.propTypes = {
  state: PropTypes.any
}

module.exports = {LoginPage, LoginForm}
