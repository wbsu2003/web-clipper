import { Container } from 'typedi';
import React from 'react';
import { IPermissionsService } from '@/service/common/permissions';
import { BUILT_IN_IMAGE_HOSTING_ID } from '@/common/backend/imageHosting/interface';
import { updateClipperHeader } from './../actions/clipper';
import { asyncRunExtension } from './../actions/userPreference';
import { CompleteStatus } from 'common/backend/interface';
import { CreateDocumentRequest, UnauthorizedError } from '@/common/backend/services/interface';
import { GlobalStore, ClipperStore } from '@/common/types';
import { DvaModelBuilder, removeActionNamespace } from 'dva-model-creator';
import update from 'immutability-helper';
import {
  selectRepository,
  initTabInfo,
  asyncCreateDocument,
  asyncChangeAccount,
  changeData,
  watchActionChannel,
} from 'pageActions/clipper';
import backend, { documentServiceFactory, imageHostingServiceFactory } from 'common/backend';
import { unpackAccountPreference } from '@/services/account/common';
import { localStorageService } from '@/common/chrome/storage';
import { notification, Button } from 'antd';
import { routerRedux } from 'dva';
import { asyncUpdateAccount } from '@/actions/account';
import { channel } from 'redux-saga';
import { IExtensionService, IExtensionContainer } from '@/service/common/extension';
import { ExtensionType } from '@/extensions/common';

const defaultState: ClipperStore = {
  clipperHeaderForm: {
    title: '',
  },
  currentAccountId: '',
  repositories: [],
  clipperData: {},
};

const actionChannel = channel();

const model = new DvaModelBuilder(defaultState, 'clipper')
  .subscript(function startWatchActionChannel({ dispatch }) {
    dispatch(removeActionNamespace(watchActionChannel()));
  })
  .takeEvery(watchActionChannel, function*(_, { put, take }) {
    while (true) {
      //@ts-ignore
      const action = yield take(actionChannel);
      yield put(action);
    }
  })
  .takeEvery(asyncChangeAccount.started, function*(payload, { call, select, put }) {
    const selector = ({
      userPreference: { imageHosting, servicesMeta },
      account: { accounts },
    }: GlobalStore) => {
      return {
        accounts,
        imageHosting,
        servicesMeta,
      };
    };
    const selectState: ReturnType<typeof selector> = yield select(selector);
    const { accounts, imageHosting } = selectState;
    let currentAccount = accounts.find(o => o.id === payload.id);
    if (!currentAccount) {
      return;
    }
    const {
      id,
      account,
      account: { type, info },
      userInfo,
    } = unpackAccountPreference(currentAccount);
    const documentService = documentServiceFactory(type, info);
    const permissionsService = Container.get(IPermissionsService);
    if (selectState.servicesMeta[type]?.permission) {
      //@ts-ignore
      const hasPermissions = yield call(
        permissionsService.contains,
        selectState.servicesMeta[type]?.permission!
      );
      if (!hasPermissions) {
        const key = `open${Date.now()}`;
        const close = () => {
          permissionsService.request(selectState.servicesMeta[type]?.permission!).then(re => {
            if (re) {
              actionChannel.put(asyncChangeAccount.started({ id }));
            }
          });
        };
        notification.error({
          key,
          placement: 'topRight',
          duration: 0,
          message: 'No Permission',
          btn: (
            <Button
              onClick={() => {
                notification.close(key);
                close();
              }}
              type="primary"
            >
              Grant
            </Button>
          ),
          onClose: () => close,
        });
        return;
      }
    }
    let repositories = [];
    // 优先使用缓存的知识库列表
    try {
      const cachedRepositoriesJson = localStorageService.get(`repositories_${id}`);
      console.log('[WizNote] 缓存查询 repositories_' + id, cachedRepositoriesJson ? '有数据' : '无数据');
      if (cachedRepositoriesJson) {
        repositories = JSON.parse(cachedRepositoriesJson);
        console.log('[WizNote] 使用缓存，数量:', repositories.length);
      }
    } catch (_e) {
      console.log('[WizNote] 缓存读取失败:', _e);
    }
    // 没有缓存则从 API 获取
    if (repositories.length === 0) {
      try {
        console.log('[WizNote] 缓存为空，从 API 获取...');
        repositories = yield call(documentService.getRepositories);
        console.log('[WizNote] API 返回，数量:', repositories.length);
        // 获取成功后缓存到 local storage
        if (repositories.length > 0) {
          try {
            yield call(localStorageService.set, `repositories_${id}`, JSON.stringify(repositories));
            console.log('[WizNote] 已缓存知识库列表');
          } catch (_e) {
            console.log('[WizNote] 缓存写入失败:', _e);
          }
        }
      } catch (error) {
        console.log('[WizNote] API 获取失败:', error);
        if (error instanceof UnauthorizedError) {
          if (documentService.refreshToken) {
            const newInfo = yield call(documentService.refreshToken, info);
            yield put(
              asyncUpdateAccount({
                id,
                account: {
                  ...account,
                  info: newInfo,
                },
                userInfo,
                newId: id,
                callback: () => {
                  actionChannel.put(asyncChangeAccount.started({ id }));
                },
              })
            );
            return;
          }
          throw new Error('Filed to load Repositories,Unauthorized.');
        } else {
          throw error;
        }
      }
    }
    backend.setDocumentService(documentService);
    let currentImageHostingService: ClipperStore['currentImageHostingService'];
    if (account.imageHosting) {
      if (account.imageHosting === BUILT_IN_IMAGE_HOSTING_ID) {
        currentImageHostingService = {
          type: type,
        };
        const imageHostingService = imageHostingServiceFactory(type, info);
        backend.setImageHostingService(imageHostingService);
      } else {
        const imageHostingIndex = imageHosting.findIndex(o => o.id === account.imageHosting);
        if (imageHostingIndex !== -1) {
          const accountImageHosting = imageHosting[imageHostingIndex];
          const imageHostingService = imageHostingServiceFactory(
            accountImageHosting.type,
            accountImageHosting.info
          );
          backend.setImageHostingService(imageHostingService);
          currentImageHostingService = {
            type: accountImageHosting.type,
          };
        }
      }
    }
    yield put(
      asyncChangeAccount.done({
        params: payload,
        result: {
          repositories,
          currentImageHostingService,
        },
      })
    );
  })
  .takeLatest(asyncCreateDocument.started, function*({ pathname }, { put, call, select }) {
    const selector = ({
      clipper: { currentRepository, clipperHeaderForm, repositories, currentAccountId },
      account: { accounts },
    }: GlobalStore) => {
      const currentAccount = accounts.find(({ id }) => id === currentAccountId);
      let repositoryId;
      if (
        currentAccount &&
        repositories.some(({ id }) => id === currentAccount.defaultRepositoryId)
      ) {
        repositoryId = currentAccount.defaultRepositoryId;
      }
      if (currentRepository) {
        repositoryId = currentRepository.id;
      }
      const extensions = Container.get(IExtensionContainer).extensions;
      const extension = extensions.find(o => o.router === pathname);
      const enabledAutomaticExtensionIds = Container.get(IExtensionService)
        .EnabledAutomaticExtensionIds;
      const automaticExtensions = extensions.filter(
        o =>
          o.type === ExtensionType.Tool &&
          o.manifest.automatic &&
          enabledAutomaticExtensionIds.some(id => id === o.id)
      );
      return {
        repositoryId,
        extensions,
        clipperHeaderForm,
        extension,
        repositories,
        automaticExtensions,
      };
    };
    const {
      repositoryId,
      clipperHeaderForm,
      extension,
      automaticExtensions,
    }: ReturnType<typeof selector> = yield select(selector);
    if (!repositoryId) {
      yield put(
        asyncCreateDocument.failed({
          params: { pathname },
          error: null,
        })
      );
      throw new Error('Must select repository.');
    }
    if (!extension) {
      // DEBT
      if (pathname !== '/editor') {
        return;
      }
    }
    for (const iterator of automaticExtensions) {
      // DEBT
      if (iterator.id === 'web-clipper/link.' && pathname === '/editor') {
        continue;
      }
      yield put.resolve(asyncRunExtension.started({ pathname, extension: iterator }));
    }
    const { data, url } = yield select((g: GlobalStore) => {
      return {
        url: g.clipper.url,
        data: g.clipper.clipperData[pathname],
      };
    });
    let createDocumentRequest: CreateDocumentRequest | null = null;
    createDocumentRequest = {
      repositoryId,
      content: data as string,
      url,
      ...clipperHeaderForm,
    };
    if (!createDocumentRequest) {
      return;
    }
    const response: CompleteStatus = yield call(
      backend.getDocumentService()!.createDocument,
      createDocumentRequest
    );
    yield put(
      asyncCreateDocument.done({
        params: { pathname },
        result: {
          result: response,
          request: createDocumentRequest,
        },
      })
    );
    yield put(routerRedux.push('/complete'));
  })
  .case(
    asyncChangeAccount.done,
    (state, { params: { id }, result: { repositories, currentImageHostingService } }) => {
      return update(state, {
        currentAccountId: {
          $set: id,
        },
        repositories: {
          $set: repositories,
        },
        currentRepository: {
          // eslint-disable-next-line no-undefined
          $set: undefined,
        },
        currentImageHostingService: {
          $set: currentImageHostingService,
        },
      });
    }
  )
  .case(selectRepository, (state, { repositoryId }) => {
    const currentRepository = state.repositories.find(o => o.id === repositoryId);
    const updateContext = backend.getImageHostingService()?.updateContext;
    if (currentRepository && updateContext) {
      updateContext({ currentRepository });
    }
    return {
      ...state,
      currentRepository,
    };
  })
  .case(initTabInfo, (state, { title, url }) => ({
    ...state,
    clipperHeaderForm: {
      ...state.clipperHeaderForm,
      title,
    },
    url,
  }))
  .case(asyncCreateDocument.started, state => ({
    ...state,
  }))
  .case(
    asyncCreateDocument.done,
    (state, { result: { result: completeStatus, request: createDocumentRequest } }) => ({
      ...state,
      completeStatus,
      createDocumentRequest,
    })
  )
  .case(updateClipperHeader, (state, clipperHeaderForm) => ({
    ...state,
    clipperHeaderForm,
  }))
  .case(changeData, (state, { data, pathName }) => {
    return update(state, {
      clipperData: {
        [pathName]: {
          $set: data,
        },
      },
    });
  });

export default model.build();
