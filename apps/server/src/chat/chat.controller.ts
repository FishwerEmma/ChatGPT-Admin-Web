import { Body, Controller, Get, Param, Post, Sse } from '@nestjs/common';
import { ChatService } from './chat.service';
import { Payload, Public } from '@/auth.guard';
import { NewMessageDto } from '@caw/types';
import { ErrorCode, ServerException } from '@/error.filter';
import { KeyPoolService } from '@libs/key-pool';

@Controller('chat')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly keyPool: KeyPoolService,
  ) {}

  @Get('sessions')
  getChatSession(@Payload('id') uid: number) {
    return this.chatService.getRecentChatSession(uid);
  }

  @Get('messages/:sid')
  async getChatMessages(@Payload('id') uid: number, @Param('sid') sid: string) {
    const data = await this.chatService.getChatMessages(uid, sid);
    if (!data) {
      return {
        sid: sid,
        topic: '新的话题',
        messages: [
          {
            role: 'system',
            content: '你好，请问有什么可以帮助您？',
          },
        ],
        updateAt: new Date(),
        _count: {
          messages: 1,
        },
      };
    }
    return {
      ...data,
      messages: data.messages.map((m) => ({
        ...m,
        role: m.role.toLowerCase(),
      })),
    };
  }

  @Post('messages/:sid?')
  @Sse()
  async newMessage(
    @Payload('id') uid: number,
    @Body() data: NewMessageDto,
    @Param('sid') sid: string,
  ) {
    const isValid = await this.chatService.limitCheck(uid, data.mid);
    if (!isValid) {
      throw new ServerException(ErrorCode.LimitExceeded, '超过当前计划用量');
    }
    const chatSession = await this.chatService.getOrNewChatSession(
      sid,
      uid,
      data.memoryPrompt,
    );
    const key = await this.keyPool.select();
    return await this.chatService.newMessage({
      userId: uid,
      sessionId: chatSession.id,
      modelId: data.mid,
      content: data.content,
      messages: chatSession.messages,
      key,
    });
  }
}
