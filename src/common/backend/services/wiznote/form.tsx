import React from 'react';
import { Form } from '@ant-design/compatible';
import '@ant-design/compatible/assets/index.less';
import { Input } from 'antd';
import { FormComponentProps } from '@ant-design/compatible/lib/form';
import { WizNoteConfig } from '@/common/backend/services/wiznote/interface';
import { FormattedMessage } from 'react-intl';
import useOriginForm from '@/hooks/useOriginForm';
import i18n from '@/common/locales';

interface WizNoteFormProps extends FormComponentProps {
  info?: WizNoteConfig;
}

const WizNoteForm: React.FC<WizNoteFormProps> = ({ form, info }) => {
  const { verified, handleAuthentication, formRules } = useOriginForm({ form, initStatus: !!info });
  const editMode = !!info;
  return (
    <React.Fragment>
      <Form.Item
        label={
          <FormattedMessage id="backend.services.wiznote.form.origin" defaultMessage="Origin" />
        }
      >
        {form.getFieldDecorator('origin', {
          initialValue: info?.origin ?? 'https://note.wiz.cn',
          rules: formRules,
        })(
          <Input.Search
            enterButton={
              <FormattedMessage
                id="backend.services.wiznote.form.authentication"
                defaultMessage="Authentication"
              />
            }
            onSearch={handleAuthentication}
            disabled={verified}
          />
        )}
      </Form.Item>
      <Form.Item
        label={<FormattedMessage id="backend.services.wiznote.form.email" defaultMessage="Email" />}
      >
        {form.getFieldDecorator('userId', {
          initialValue: info?.userId,
          rules: [
            {
              required: true,
              message: i18n.format({
                id: 'backend.services.wiznote.form.email.required',
                defaultMessage: 'Email is required.',
              }),
            },
          ],
        })(<Input disabled={editMode} />)}
      </Form.Item>
      <Form.Item
        label={
          <FormattedMessage id="backend.services.wiznote.form.password" defaultMessage="Password" />
        }
      >
        {form.getFieldDecorator('password', {
          initialValue: info?.password,
          rules: [
            {
              required: true,
              message: i18n.format({
                id: 'backend.services.wiznote.form.password.required',
                defaultMessage: 'Password is required.',
              }),
            },
          ],
        })(<Input disabled={editMode} type="password" />)}
      </Form.Item>
    </React.Fragment>
  );
};

export default WizNoteForm;
